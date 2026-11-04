// Local JSON test backend for the storage interface (skills/tracker/references/store/).
// Built on the document layer (docs.mjs), which keeps the artifact database's write rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDocs, StoreError, VersionConflict, AlreadyExists, MAX_BATCH_WRITES, MAX_BATCH_BYTES } from './docs.mjs';
import { basePlaybook, pickPlaybook, ownItem } from './playbook.mjs';
import { rating, MARK, DEFAULT_TALK } from '../dashboard/derive.mjs';
import { teamStatus, dueAlerts, keepShown } from './team.mjs';

export { StoreError, VersionConflict, MARK };

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINTER = 'cycles.json';
const LOCAL = 'local:';
const NOT_SET_UP = 'עוד לא הוקם מעקב — הרץ `/student-tracker:setup`';
const MAX_RETRIES = 10;
// Evidence kinds and the kind-specific fields each may carry, with the value stored when absent.
const TEST_FIELDS = { subject: null, test: null, unlisted: false };
const KIND_FIELDS = {
  talk: { topics: [] },
  test: { ...TEST_FIELDS, score: null, self: null },
  'code-review': TEST_FIELDS,
  'project-observation': { project: null }, // + `team`, filled from teams
  'self-assessment': {},
  'improve-keep': {},
  goal: {},
  background: {},
  'evaluation-event': {},
  note: {},
  clarification: { clarifies: null },
};
export const KINDS = Object.keys(KIND_FIELDS);
export const SENSITIVE_CATEGORIES = ['health', 'family', 'distress', 'finances', 'romance', 'discipline'];
// The Commander may mark anything sensitive; what fits no category is `other`.
const FLIP_CATEGORIES = [...SENSITIVE_CATEGORIES, 'other'];
// A sensitive piece is one of the kinds with no fields of their own.
const SENSITIVE_KINDS = KINDS.filter((k) => !Object.keys(KIND_FIELDS[k]).length);

// dataDir holds the pointer cycles.json = {current, archived}; `current` names the store.
// `interrupt(point, info)` is called at each step boundary of a multi-step write; tests use it
// to simulate a crash (throw) or a racing writer. Points: 'seeded', 'chunk', 'chunk-written',
// 'withdraw', 'withdrawn' (a Retraction or hard delete chunk).
// `base(framework)` gives the base Playbook items (the shipped ones by default; tests pass a fixture).
// `cycle`: the address of an archived Cycle (one in the pointer's `archived`) to read instead of
// the current one. Archived Cycles are read-only: every write on one is refused.
// `docs`: a docs layer to run over instead of the Cycle's local one (the plan step's snapshot
// layer); the operations that work on the pointer or other Cycles still need `dataDir`.
export function openStore({ dataDir, docs: given, cycle: address, now = () => new Date(), rand = randomChars, interrupt = () => {}, base = basePlaybook } = {}) {
  if (!dataDir && !given) throw new StoreError('missing plugin data dir');
  const pointerPath = dataDir && path.join(dataDir, POINTER);
  const readPointer = () => ({ current: null, archived: [], ...readJson(pointerPath) });

  function storeRoot() {
    const { current, archived } = readPointer();
    if (address && address !== current && !archived.includes(address)) {
      throw new StoreError(`no Cycle ${address} in the pointer: read the current one, or one listed in its archived`);
    }
    const url = address ?? current;
    if (!url) throw new StoreError(NOT_SET_UP);
    return rootOf(url);
  }
  const openRead = () => given ?? openDocs(storeRoot());
  // Writes go to the current Cycle only, and never to one marked archived.
  function open() {
    const docs = openRead();
    const { current } = given ? { current: address } : readPointer();
    const cycle = docs.get('meta/cycle')?.data;
    if ((address && address !== current) || cycle?.archived === true) {
      const currentName = current && current !== address ? openDocs(rootOf(current)).get('meta/cycle')?.data?.name : null;
      throw new StoreError(`המחזור ${cycle?.name ?? address} בארכיון — אפשר רק לקרוא ממנו. ${currentName ? `עדכונים נרשמים במחזור הנוכחי, ${currentName}.` : 'אין מחזור נוכחי: הרץ `/student-tracker:setup`.'}`);
    }
    return docs;
  }
  // A Cycle's store by its address, which must hold a Cycle.
  function cycleAt(url, what) {
    const root = localRoot(url);
    const docs = root && fs.existsSync(root) ? openDocs(root) : null;
    if (!docs?.get('meta/cycle')) throw new StoreError(`no Cycle at ${url} to ${what}`);
    return docs;
  }

  // No current Cycle in the pointer: like the artifact backend's title lookup, find this
  // machine's Cycles (archived ones aside). One is saved as current; several are put to the
  // Commander; none leaves the pointer as it was.
  function adoptLocalCycle() {
    const pointer = readPointer();
    const dir = path.join(dataDir, 'local');
    const found = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      .map((d) => path.join(dir, d))
      .map((root) => ({ url: `${LOCAL}${root}`, cycle: openDocs(root).get('meta/cycle')?.data }))
      .filter((c) => c.cycle && c.cycle.archived !== true && !pointer.archived.includes(c.url));
    if (found.length > 1) {
      throw new StoreError(`several Cycles on this machine: ${found.map((c) => `${c.cycle.name} (${c.url})`).join(', ')}; ask the Commander which one`);
    }
    if (found.length === 1) writeJson(pointerPath, { ...pointer, current: found[0].url });
  }
  // Every earlier Cycle is in the pointer's `archived`, so it stays readable: a pointer rebuilt
  // after a lost one (or emptied by hand) gets them back by following each Cycle's `previous`.
  // Those it lacked go in oldest first, before the ones it has.
  function mendArchived(cycle) {
    const pointer = readPointer();
    const chain = [];
    for (let c = cycle; c?.previous && !chain.includes(c.previous) && c.previous !== pointer.current;) {
      chain.unshift(c.previous);
      const root = localRoot(c.previous);
      c = root && fs.existsSync(root) ? openDocs(root).get('meta/cycle')?.data : null;
    }
    const missing = chain.filter((u) => !pointer.archived.includes(u));
    if (missing.length) writeJson(pointerPath, { ...pointer, archived: [...missing, ...pointer.archived] });
  }
  const today = () => localDate(now());
  // What team status and alerts are computed from.
  const teamInputs = (docs) => ({
    cards: flat(docs.list('trainees')),
    cycle: docs.get('meta/cycle')?.data,
    framework: docs.get('meta/skills')?.data,
    talk: docs.get('commander/settings')?.data?.talk ?? DEFAULT_TALK,
    today: today(),
  });

  // Read every source record of one Trainee (its sensitive records included) and derive the
  // card from them, plus `extra` records ({path, data}) about to be written.
  function derive(docs, tid, extra = [], removed = new Set()) {
    const fromExtra = (prefix) => extra
      .filter((r) => r.path.startsWith(prefix) && r.data.trainee === tid)
      .map((r) => ({ id: r.path.slice(prefix.length), ...r.data }));
    const kept = (prefix, records) => records.filter((r) => !removed.has(`${prefix}${r.id}`));
    const sub = (name) => [
      ...kept(`trainees/${tid}/${name}/`, flat(docs.list(`trainees/${tid}/${name}`))),
      ...fromExtra(`trainees/${tid}/${name}/`),
    ];
    const sensitive = [...kept('sensitive/', sensitiveOf(docs, tid)), ...fromExtra('sensitive/')];
    const prev = docs.get(`trainees/${tid}`)?.data;
    return deriveCard({
      changes: sub('changes'), evidence: sub('evidence'), followups: sub('followups'), items: sub('items'), assessments: sub('assessments'), sensitive,
    }, prev);
  }

  function rebuildCard(docs, tid) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const current = docs.get(`trainees/${tid}`);
      const card = derive(docs, tid);
      if (current && sameJson(current.data, card)) return { id: tid, ...card };
      try {
        upsert(docs, `trainees/${tid}`, card, current);
        return { id: tid, ...card };
      } catch (e) {
        if (!lostRace(e)) throw e;
      }
    }
    throw new StoreError(`card ${tid} kept changing; try again`);
  }

  // One Trainee's share of an Entry: its new records plus its card, in one version-pinned batch.
  function writeChunk(docs, { trainee, records }) {
    const missing = records.filter((r) => !docs.taken(r.path));
    if (!missing.length) {
      rebuildCard(docs, trainee); // written earlier; make sure the card caught up
      return;
    }
    const card = docs.get(`trainees/${trainee}`);
    const next = derive(docs, trainee, missing);
    const creates = missing.map((r) => ({ op: 'create', path: r.path, data: r.data }));
    interrupt('chunk', { trainee }); // between reading the card and writing it: the race window
    try {
      docs.batch([...creates, { op: 'set', path: `trainees/${trainee}`, data: next, ifVersion: card.version }]);
    } catch (e) {
      if (!lostRace(e)) throw e;
      // Another session moved the card or wrote these records first: keep whatever records are
      // still missing, then rebuild the card from sources. Unless it has hard-deleted the Entry
      // meanwhile: then they are missing on purpose.
      const entry = docs.get(`entries/${missing[0].data.entry}`);
      for (const c of entry && !entry.data.deletion ? creates : []) {
        try {
          docs.batch([c]);
        } catch (err) {
          if (!(err instanceof AlreadyExists)) throw err;
        }
      }
      rebuildCard(docs, trainee);
    }
    interrupt('chunk-written', { trainee });
  }

  function finishEntry(docs, id) {
    for (const chunk of docs.get(`entries/${id}`).data.pending ?? []) writeChunk(docs, chunk);
    writeEntry(docs, id, ({ data }) => {
      if (data.status === 'done') return null; // another session finished it
      const { pending, ...rest } = data;
      return { op: 'set', data: { ...rest, status: 'done' } };
    });
  }

  // One Trainee's share of a Retraction or hard delete (`how` = RETRACT | DELETE): the records of
  // `ids` still to withdraw, flagged or removed in one version-pinned batch with the rebuilt card.
  function withdrawChunk(docs, tid, ids, how) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const todo = childrenOf(docs, tid, ids).filter(how.pending);
      if (!todo.length) {
        rebuildCard(docs, tid); // done earlier; make sure the card caught up
        return;
      }
      const card = docs.get(`trainees/${tid}`);
      const next = derive(docs, tid, todo.flatMap(how.after), new Set(todo.map((r) => r.path)));
      interrupt('withdraw', { trainee: tid });
      try {
        docs.batch([
          ...todo.map(how.write),
          card ? { op: 'set', path: `trainees/${tid}`, data: next, ifVersion: card.version } : { op: 'create', path: `trainees/${tid}`, data: next },
        ]);
      } catch (e) {
        if (!lostRace(e)) throw e;
        continue;
      }
      interrupt('withdrawn', { trainee: tid });
      return;
    }
    throw new StoreError(`card ${tid} kept changing; try again`);
  }

  // Withdraws everything cut from a marked Entry, Trainee by Trainee, then closes the mark.
  // Gone already (another session hard-deleted it): nothing left to do.
  function finishWithdrawal(docs, id, how) {
    const entry = docs.get(`entries/${id}`);
    if (!entry) return;
    for (const tid of entry.data.trainees) withdrawChunk(docs, tid, entry.data.children, how);
    writeEntry(docs, id, how.close);
  }

  // Finishes every Entry, Retraction and hard delete left at `writing` in this store; their ids.
  function finishPending(docs) {
    const stuck = (key) => docs.list('entries').filter((e) => e.data[key] === 'writing').map((e) => e.id);
    const writing = stuck('status');
    for (const id of writing) finishEntry(docs, id);
    const retracting = stuck('retraction');
    for (const id of retracting) finishWithdrawal(docs, id, RETRACT);
    const deleting = stuck('deletion');
    for (const id of deleting) finishWithdrawal(docs, id, DELETE);
    return [...new Set([...writing, ...retracting, ...deleting])];
  }

  // The Entry by id, or the last one written; finished first if an earlier session left it half-written.
  function entryToWithdraw(docs, eid) {
    const all = docs.list('entries').filter((e) => !e.data.deletion);
    const entry = eid ? all.find((e) => e.id === eid) : all.sort((a, b) => byAt(a.data, b.data) || a.id.localeCompare(b.id)).at(-1);
    if (!entry) throw new StoreError(eid ? `no Entry ${eid}` : 'nothing has been recorded yet');
    // A chunk written after the Retraction would bring its records back unflagged.
    if (entry.data.status === 'writing') finishEntry(docs, entry.id);
    return entry.id;
  }

  // One `changes` record of a Trainee plus their rebuilt card, in one version-pinned batch.
  const writeChange = (docs, tid, change) => writeChangeRecord(docs, tid, change).card;
  // The same, giving the record's id too: {id, card}.
  function writeChangeRecord(docs, tid, change) {
    const id = changeId(docs, tid, now());
    const record = { path: `trainees/${tid}/changes/${id}`, data: change };
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const card = docs.get(`trainees/${tid}`);
      const next = derive(docs, tid, [{ ...record, data: { ...change, trainee: tid } }]);
      try {
        docs.batch([
          { op: 'create', path: record.path, data: change },
          { op: 'set', path: `trainees/${tid}`, data: next, ifVersion: card.version },
        ]);
        return { id, card: { id: tid, ...next } };
      } catch (e) {
        if (!(e instanceof VersionConflict)) throw e;
      }
    }
    throw new StoreError(`card ${tid} kept changing; try again`);
  }

  // A free id for a change record outside an Entry, `c-YYYYMMDD-HHMM-<rand2>` at `d`.
  function changeId(docs, tid, d) {
    let id;
    do id = `${stampOf('c', d)}-${rand(2)}`; while (docs.taken(`trainees/${tid}/changes/${id}`));
    return id;
  }

  // A pinned write on an Entry, retried while other sessions move it. `write(entry)` gives the
  // write ({op, data}) or null when there is nothing left to do.
  function writeEntry(docs, id, write) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const entry = docs.get(`entries/${id}`);
      const w = entry && write(entry);
      if (!w) return;
      try {
        docs.batch([{ ...w, path: `entries/${id}`, ifVersion: entry.version }]);
        return;
      } catch (e) {
        if (!(e instanceof VersionConflict)) throw e;
      }
    }
    throw new StoreError(`Entry ${id} kept changing; try again`);
  }

  return {
    connect() {
      if (!readPointer().current) adoptLocalCycle();
      const r = storeRoot();
      const cycle = openDocs(r).get('meta/cycle')?.data;
      if (!cycle) throw new StoreError(NOT_SET_UP);
      if (!address) mendArchived(cycle);
      return { backend: 'local', url: `${LOCAL}${r}`, cycle: cycle.name, setup: cycle.setup, ...(cycle.archived === true ? { archived: true } : {}) };
    },

    // Setup only. Seeds the Cycle and leaves it `in-progress` (see finishSetup). Resumes a Cycle
    // whose setup was interrupted; refuses one that is already done.
    // `previous`: a new Cycle after the current one, which must be done. The new Cycle gets its
    // own store; the previous one moves to the pointer's `archived` at once, so it is never lost.
    createCycle({ commander, cycle, trainees = [], previous }) {
      if (!commander?.name) throw new StoreError('commander.name is required');
      if (!cycle?.name) throw new StoreError('cycle.name is required');
      if (cycle.start !== undefined) checkDate(cycle.start);
      const names = trainees.map((t) => (typeof t === 'string' ? t : t.name));
      names.forEach((n, i) => names.slice(i + 1).forEach((m) => checkNames(n, m)));

      const pointer = readPointer();
      let existing = localRoot(pointer.current);
      const existingCycle = existing && openDocs(existing).get('meta/cycle')?.data;
      const resuming = existingCycle?.setup === 'in-progress';
      if (previous !== undefined && !(resuming && existingCycle.previous === previous)) {
        if (previous !== pointer.current || existingCycle?.setup !== 'done') {
          throw new StoreError(`previous must be the current Cycle (${pointer.current ?? 'none'}), set up and done`);
        }
        existing = null; // a fresh store for the new Cycle
      } else if (existingCycle?.setup === 'done') {
        throw new StoreError(`כבר קיים מעקב למחזור ${existingCycle.name} (a new Cycle names it as previous)`);
      }
      const follows = previous ?? (existing ? existingCycle?.previous : undefined);
      // Resuming keeps what the interrupted setup stored; answers given again replace it. A new
      // Cycle starts from the previous Cycle's settings.
      const prior = (existing && openDocs(existing).get('commander/settings')?.data)
        ?? (localRoot(follows) && openDocs(localRoot(follows)).get('commander/settings')?.data);
      const talk = talkSettings(prior?.talk ?? DEFAULT_TALK, commander.talk);
      const r = existing ?? path.join(dataDir, 'local', `c-${rand(6)}`);
      // Pointer first, so an interrupted seed is found and resumed instead of duplicated.
      const archived = previous && !existing ? [...pointer.archived.filter((u) => u !== previous), previous] : pointer.archived;
      writeJson(pointerPath, { ...pointer, current: `${LOCAL}${r}`, archived });
      const docs = openDocs(r);

      const at = isoWithOffset(now());
      upsert(docs, 'meta/cycle', {
        name: cycle.name,
        start: cycle.start ?? (existing && existingCycle?.start) ?? today(),
        setup: 'in-progress',
        schema: 1,
        archived: false,
        ...(follows ? { previous: follows } : {}),
        at,
      });
      // Created once: setup's own changes (added Skills, preset differences) may already be in them.
      for (const [doc, file] of [['meta/skills', 'skills.json'], ['meta/preset', 'preset.json']]) {
        if (!docs.get(doc)) docs.batch([{ op: 'create', path: doc, data: readJson(path.join(PLUGIN_ROOT, 'data', file)) }]);
      }
      upsert(docs, 'commander/settings', {
        name: commander.name,
        role: commander.role === undefined ? prior?.role ?? null : commander.role?.trim() || null,
        talk,
        at,
      });
      if (!docs.get('commander/hides')) docs.batch([{ op: 'create', path: 'commander/hides', data: { hidden: [] } }]);

      const seeded = docs.list('trainees');
      const all = names.map((name) => {
        const found = seeded.find((t) => t.data.name === name);
        if (found) return { id: found.id, name };
        const id = `t-${rand(6)}`;
        const added = { type: 'added', name, by: 'commander', at, retracted: false };
        docs.batch([
          { op: 'create', path: `trainees/${id}/changes/added`, data: added },
          { op: 'create', path: `trainees/${id}`, data: deriveCard({ changes: [added], evidence: [] }) },
        ]);
        return { id, name };
      });
      interrupt('seeded');
      return { url: `${LOCAL}${r}`, trainees: all };
    },

    // Setup only, last: after the seed and everything setup records into it (preset changes,
    // teams, Skills, setup Entries). Until then the Cycle stays `in-progress` and setup resumes it.
    finishSetup() {
      const docs = open();
      const cycle = docs.get('meta/cycle')?.data;
      if (!cycle) throw new StoreError(NOT_SET_UP);
      if (cycle.setup === 'done') return cycle;
      return pinned(docs, 'meta/cycle', (current) => ({ ...current, setup: 'done' }));
    },

    readCycle() {
      const docs = openRead();
      return {
        cycle: docs.get('meta/cycle')?.data,
        skills: docs.get('meta/skills')?.data,
        preset: docs.get('meta/preset')?.data ?? null,
        commander: {
          settings: docs.get('commander/settings')?.data,
          hides: docs.get('commander/hides')?.data ?? { hidden: [] },
        },
        playbook: flat(docs.list('playbook')),
        teams: flat(docs.list('teams')),
      };
    },

    readTeam() {
      return flat(openRead().list('trainees'));
    },

    // Retracted records and Entries are left out unless `retracted` asks for them too.
    readTrainee(tid, { since, retracted = false } = {}) {
      const docs = openRead();
      const card = docs.get(`trainees/${tid}`);
      if (!card) throw new StoreError(`unknown Trainee ${tid}`);
      const shown = (x) => retracted || x.retracted === false;
      const sub = (name) => flat(docs.list(`trainees/${tid}/${name}`)).filter(shown);
      const from = (d) => !since || d >= since;
      return {
        card: { id: tid, ...card.data },
        evidence: sub('evidence').filter((e) => from(e.date)),
        assessments: sub('assessments').filter((a) => from(a.date ?? a.at.slice(0, 10))),
        followups: sub('followups'),
        items: sub('items'),
        changes: sub('changes'),
        sensitive: sensitiveOf(docs, tid).filter((s) => shown(s) && from(s.date)),
        entries: flat(docs.list('entries')).filter((e) => shown(e) && !e.deletion && e.trainees.includes(tid) && from(e.at.slice(0, 10))),
      };
    },

    // The Playbook items Advice draws on for one Trainee: base items (shipped with the plugin)
    // merged with the Commander's own and their hides, per target Skill. A read: stores nothing.
    readPlaybook(tid, { skills = [] } = {}) {
      const docs = openRead();
      const card = docs.get(`trainees/${tid}`);
      if (!card) throw new StoreError(`unknown Trainee ${tid}`);
      const framework = docs.get('meta/skills')?.data;
      return pickPlaybook({
        base: base(framework),
        own: flat(docs.list('playbook')),
        hidden: docs.get('commander/hides')?.data?.hidden ?? [],
        framework,
        card: card.data,
        today: today(),
        rate: rating,
        focus: skills,
      });
    },

    // "מה המצב": who needs a Talk, who is declining, shared weaknesses, the rest. A read.
    readStatus() {
      return teamStatus(teamInputs(openRead()));
    },

    // The one proactive alert for this reply, if any is due, and how many more are; marks it shown
    // today in `meta/alerts`, so no conversation shows it again today. `pattern`: {trainee, theme},
    // a pattern the agent saw repeated 3+ times for the Trainee just written about.
    takeAlert({ pattern } = {}) {
      const docs = open();
      if (pattern !== undefined) {
        if (!docs.get(`trainees/${pattern?.trainee}`)) throw new StoreError(`unknown Trainee ${pattern?.trainee}`);
        if (typeof pattern.theme !== 'string' || !pattern.theme.trim()) throw new StoreError('a pattern needs its theme');
      }
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const current = docs.get('meta/alerts');
        const shown = current?.data.shown ?? {};
        const inputs = teamInputs(docs);
        const due = dueAlerts({ ...inputs, shown, pattern });
        if (!due.length) return { alert: null, more: 0 };
        try {
          upsert(docs, 'meta/alerts', { shown: { ...keepShown(shown, inputs), [due[0].key]: inputs.today } }, current);
          return { alert: due[0], more: due.length - 1 };
        } catch (e) {
          if (!lostRace(e)) throw e;
        }
      }
      throw new StoreError('meta/alerts kept changing; try again');
    },

    // Entry written as `writing` with its whole plan → one chunk per Trainee → `done`.
    // Child ids are deterministic, so finishing it again never duplicates a record.
    // `insist`: the Commander asked to record about a Trainee who left.
    recordEntry({ text, evidence = [], assessments = [], items = [], changes = [], insist = false }) {
      const docs = open();
      if (!text) throw new StoreError('Entry text is required');
      if (!evidence.length) throw new StoreError('an Entry needs at least one Evidence');
      const preset = docs.get('meta/preset')?.data;
      const teams = flat(docs.list('teams'));
      const fieldsOf = [];
      const closing = new Set();
      // Checked against the card, as the artifact backend does; the card is kept in step with the sources.
      const closeAll = (tid, ids) => {
        const openIds = docs.get(`trainees/${tid}`).data.followups.map((f) => f.id);
        for (const fid of ids) {
          if (!openIds.includes(fid) || closing.has(fid)) throw new StoreError(`${fid} is not an open Follow-up of ${tid}`);
          closing.add(fid);
        }
      };
      const checkFollowups = (followups) => {
        for (const f of followups) {
          if (!f || !text.includes(f)) throw new StoreError(`a Follow-up must be copied word-for-word from the Entry: "${f}"`);
        }
      };
      // Where in the Entry each sensitive part stands; no public text may reach into one.
      const sensitiveSpans = evidence.flatMap((ev) => (ev.sensitive ?? []).flatMap((s) => spansOf(text, s.excerpt)));
      for (const { followups = [], sensitive = [], ...ev } of evidence) {
        if (!docs.get(`trainees/${ev.trainee}`)) throw new StoreError(`unknown Trainee ${ev.trainee}`);
        checkActive(docs, ev.trainee, insist);
        if (!KINDS.includes(ev.kind)) throw new StoreError(`unknown kind "${ev.kind}" (one of ${KINDS.join(', ')})`);
        checkDate(ev.date);
        if (!wordForWord(text, ev.excerpt)) {
          throw new StoreError(`excerpt must be copied word-for-word from the Entry: "${ev.excerpt}"`);
        }
        const fields = kindFields(ev, preset, teams);
        if (ev.kind === 'clarification' && !evidenceOf(docs, ev.trainee, fields.clarifies)) {
          throw new StoreError(`a clarification needs clarifies = the id of the ${ev.trainee} Evidence it corrects`);
        }
        checkFollowups(followups);
        // A public text that still holds a sensitive sentence, or a piece of one, would show it on the dashboard.
        const publicTexts = [...(ev.excerpt ?? '').split(MARK).map((p) => p.trim()), ...followups].filter(Boolean);
        for (const t of publicTexts) {
          if (!spansOf(text, t).some((span) => !sensitiveSpans.some((x) => overlaps(span, x)))) {
            throw new StoreError(`"${t}" holds a sensitive part; put ${MARK} in its place, or open the Follow-up from the sensitive part`);
          }
        }
        const marked = ev.excerpt.includes(MARK);
        if (sensitive.length && !marked) throw new StoreError(`an Evidence with a sensitive part shows ${MARK} in its place`);
        if (marked && !sensitive.length) throw new StoreError(`${MARK} stands only where a sensitive part was cut out`);
        closeAll(ev.trainee, fields.closes);
        for (const piece of sensitive) {
          const { category, excerpt, kind = 'note', closes = [], followups: pieceFollowups = [], ...rest } = piece;
          if (Object.keys(rest).length) throw new StoreError(`a sensitive part takes only category, excerpt, kind, closes and followups`);
          if (!SENSITIVE_CATEGORIES.includes(category)) {
            throw new StoreError(`sensitive category must be one of ${SENSITIVE_CATEGORIES.join(', ')}, got "${category}"`);
          }
          if (!excerpt || !text.includes(excerpt)) {
            throw new StoreError(`a sensitive excerpt must be copied word-for-word from the Entry: "${excerpt}"`);
          }
          if (!SENSITIVE_KINDS.includes(kind)) throw new StoreError(`a sensitive part is one of ${SENSITIVE_KINDS.join(', ')}, got "${kind}"`);
          checkFollowups(pieceFollowups);
          closeAll(ev.trainee, closes);
        }
        fieldsOf.push(fields);
      }

      const d = now();
      const at = isoWithOffset(d);
      const stamp = stampOf('e', d);
      let id;
      do id = `${stamp}-${rand(2)}`; while (docs.taken(`entries/${id}`));

      // Numbered in message order: the Evidence first, then the sensitive parts cut from it, then
      // the Follow-ups each of them opens.
      let n = 0;
      const nextId = () => `${id}-${++n}`;
      const children = evidence.map((ev, i) => {
        const { trainee, kind, date, excerpt } = ev;
        const childId = nextId();
        return {
          id: childId,
          path: `trainees/${trainee}/evidence/${childId}`,
          trainee,
          data: { entry: id, trainee, kind, date, excerpt, ...fieldsOf[i], at, retracted: false },
        };
      });
      const partsOf = evidence.map((ev, i) => (ev.sensitive ?? []).map((piece) => {
        const childId = nextId();
        const { trainee, date } = ev;
        return {
          id: childId,
          path: `sensitive/${childId}`,
          trainee,
          followups: piece.followups ?? [],
          data: {
            record: 'evidence', entry: id, trainee, kind: piece.kind ?? 'note', category: piece.category, date,
            excerpt: piece.excerpt, in: children[i].id, closes: piece.closes ?? [], at, retracted: false,
          },
        };
      }));
      const parts = partsOf.flat();
      const opened = [];
      // A Follow-up is kept where the record that opens it is: a sensitive part's is sensitive too.
      const openFollowups = (texts, from) => {
        const sensitive = from.path.startsWith('sensitive/');
        for (const t of texts) {
          const childId = nextId();
          const data = { entry: id, trainee: from.trainee, text: t, from: from.id, date: from.data.date, at, retracted: false };
          opened.push(sensitive
            ? { id: childId, path: `sensitive/${childId}`, trainee: from.trainee, data: { record: 'followup', ...data } }
            : { id: childId, path: `trainees/${from.trainee}/followups/${childId}`, trainee: from.trainee, data });
        }
      };
      for (const [i, ev] of evidence.entries()) {
        openFollowups(ev.followups ?? [], children[i]);
        for (const part of partsOf[i]) openFollowups(part.followups, part);
      }
      // Assessments come next; `#<n>` cites this Entry's record `<entryId>-<n>`.
      const ours = [...children, ...parts];
      const cite = (ref, tid) => {
        const local = /^#\d+$/.test(ref) && ours.find((c) => c.id === `${id}-${ref.slice(1)}`);
        if (local) {
          if (local.trainee !== tid) return null;
          return { id: local.id, date: local.data.date, kind: local.data.kind, local: true, sensitive: local.path.startsWith('sensitive/') };
        }
        return /^#/.test(ref) ? null : evidenceOf(docs, tid, ref);
      };
      const judged = checkAssessments(docs, assessments, cite).map((a) => {
        const childId = nextId();
        return {
          id: childId,
          path: `trainees/${a.trainee}/assessments/${childId}`,
          trainee: a.trainee,
          data: { entry: id, ...a, at, retracted: false },
        };
      });
      // Then the improve/keep items, kept where their origin Evidence is (a sensitive part's are
      // sensitive too), then the Trainee-state changes, each in the order given.
      const touched = new Set(children.map((c) => c.trainee));
      const listed = items.map(({ trainee, kind, text: words, by, from, ...rest }) => {
        if (Object.keys(rest).length) throw new StoreError('an improve/keep item takes only trainee, kind, text, by and from');
        checkTouched(touched, trainee, 'an improve/keep item');
        if (!ITEM_KINDS.includes(kind)) throw new StoreError(`an improve/keep item is improve or keep, got "${kind}"`);
        if (!ITEM_AUTHORS.includes(by)) throw new StoreError(`an improve/keep item is by the agent or commander, got "${by}"`);
        if (typeof words !== 'string' || !words.trim()) throw new StoreError('an improve/keep item needs its text');
        const origin = from && cite(from, trainee);
        if (!origin) throw new StoreError(`an improve/keep item names its origin Evidence (from): #<n> or a stored id of ${trainee}`);
        if (by === 'commander') {
          if (!text.includes(words)) throw new StoreError(`the Commander's improve/keep item is copied word-for-word from the Entry: "${words}"`);
          if (!origin.sensitive && !spansOf(text, words).some((span) => !sensitiveSpans.some((x) => overlaps(span, x)))) {
            throw new StoreError(`"${words}" holds a sensitive part; take the item from the sensitive part (from)`);
          }
        }
        const childId = nextId();
        const data = { entry: id, trainee, kind, text: words, by, from: origin.id, date: origin.date, at, retracted: false };
        return origin.sensitive
          ? { id: childId, path: `sensitive/${childId}`, trainee, data: { record: 'item', ...data } }
          : { id: childId, path: `trainees/${trainee}/items/${childId}`, trainee, data };
      });
      const stated = checkChanges(docs, changes, cite, touched).map((c) => {
        const childId = nextId();
        return {
          id: childId,
          path: `trainees/${c.trainee}/changes/${childId}`,
          trainee: c.trainee,
          data: { entry: id, ...c, at, retracted: false },
        };
      });
      // What you write yourself for display (reasons, Snapshots, your own items, Talk topics,
      // next-Talk questions) repeats neither this Entry's sensitive parts nor the Trainee's stored
      // ones; what this Entry shows in public excerpts is shown anyway.
      const repeated = repeatsSensitive(text, evidence.flatMap((ev) => (ev.sensitive ?? []).map((p) => p.excerpt)), sensitiveSpans);
      const leaks = {};
      const leaksOf = (tid) => (leaks[tid] ??= leaksFor(docs, tid, {
        also: repeated,
        shown: children.filter((c) => c.trainee === tid).flatMap((c) => c.data.excerpt.split(MARK)),
      }));
      for (const c of children) checkDisplaySafe(c.data.topics ?? [], leaksOf(c.trainee));
      for (const r of [...judged, ...listed, ...stated]) {
        checkDisplaySafe([r.data.reason, r.data.by === 'agent' ? r.data.text : null, ...(r.data.questions ?? [])], leaksOf(r.trainee));
      }
      const all = [...children, ...parts, ...opened, ...judged, ...listed, ...stated];
      const trainees = [...new Set(all.map((c) => c.trainee))];
      const pending = trainees.map((trainee) => ({
        trainee,
        records: all.filter((c) => c.trainee === trainee).map(({ path: p, data }) => ({ path: p, data })),
      }));
      for (const chunk of pending) {
        const bytes = Buffer.byteLength(JSON.stringify(chunk.records));
        if (chunk.records.length + 1 > MAX_BATCH_WRITES || bytes > MAX_BATCH_BYTES) {
          throw new StoreError(`too much for one Trainee in one Entry (${chunk.records.length} records); split the Entry`);
        }
      }

      docs.batch([{
        op: 'create',
        path: `entries/${id}`,
        data: { text, at, status: 'writing', trainees, children: all.map((c) => c.id), retracted: false, pending },
      }]);
      finishEntry(docs, id);
      return {
        entry: id,
        evidence: children.map((c) => c.id),
        sensitive: parts.map((c) => c.id),
        followups: opened.map((c) => c.id),
        assessments: judged.map((c) => c.id),
        items: listed.map((c) => c.id),
        changes: stated.map((c) => c.id),
      };
    },

    // Assessments of one Trainee outside an Entry (a re-rate, an accepted proposal), dated today,
    // in one version-pinned batch with the card.
    // `nextTalk`: fresh next-Talk questions to go with it, as a change record.
    recordAssessments(tid, assessments = [], { insist = false, nextTalk } = {}) {
      const docs = open();
      if (!assessments.length) throw new StoreError('give at least one Assessment');
      checkActive(docs, tid, insist);
      const checked = checkAssessments(docs, assessments.map((a) => ({ ...a, trainee: tid })), (ref) => evidenceOf(docs, tid, ref));
      const leaks = leaksFor(docs, tid);
      checkDisplaySafe(checked.map((a) => a.reason), leaks);
      const d = now();
      const at = isoWithOffset(d);
      const stamp = stampOf('a', d);
      const taken = new Set();
      const rated = checked.map((a) => {
        let id;
        do id = `${stamp}-${rand(2)}`; while (taken.has(id) || docs.taken(`trainees/${tid}/assessments/${id}`));
        taken.add(id);
        return { id, path: `trainees/${tid}/assessments/${id}`, data: { entry: null, ...a, date: today(), at, retracted: false } };
      });
      const talked = [];
      if (nextTalk !== undefined) {
        const questions = checkQuestions(nextTalk);
        checkDisplaySafe(questions, leaks);
        const id = changeId(docs, tid, d);
        talked.push({ id, path: `trainees/${tid}/changes/${id}`, data: { type: 'nextTalk', entry: null, trainee: tid, questions, by: 'agent', at, retracted: false } });
      }
      const records = [...rated, ...talked];
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const card = docs.get(`trainees/${tid}`);
        try {
          docs.batch([
            ...records.map((r) => ({ op: 'create', path: r.path, data: r.data })),
            { op: 'set', path: `trainees/${tid}`, data: derive(docs, tid, records), ifVersion: card.version },
          ]);
          return { assessments: rated.map((r) => r.id), ...(nextTalk !== undefined ? { changes: talked.map((r) => r.id) } : {}) };
        } catch (e) {
          if (!(e instanceof VersionConflict)) throw e;
        }
      }
      throw new StoreError(`card ${tid} kept changing; try again`);
    },

    // The brief's refreshed next-Talk questions, on their own: a `nextTalk` change (no Entry) with
    // the card, so the dashboard shows the questions the brief showed.
    recordNextTalk(tid, questions) {
      const docs = open();
      if (!docs.get(`trainees/${tid}`)) throw new StoreError(`unknown Trainee ${tid}`);
      checkActive(docs, tid, false);
      const checked = checkQuestions(questions);
      checkDisplaySafe(checked, leaksFor(docs, tid));
      const { id, card } = writeChangeRecord(docs, tid, { type: 'nextTalk', entry: null, trainee: tid, questions: checked, by: 'agent', at: isoWithOffset(now()), retracted: false });
      return { change: id, card };
    },

    // A fresh Snapshot on its own (no Entry), when marking something sensitive left the card's
    // Snapshot repeating it: the dashboard stops showing it now, not at the next update.
    recordSnapshot(tid, text) {
      const docs = open();
      if (!docs.get(`trainees/${tid}`)) throw new StoreError(`unknown Trainee ${tid}`);
      checkActive(docs, tid, false);
      if (typeof text !== 'string' || !text.trim()) throw new StoreError('a Snapshot needs its text');
      checkDisplaySafe([text.trim()], leaksFor(docs, tid));
      const { id, card } = writeChangeRecord(docs, tid, { type: 'snapshot', entry: null, trainee: tid, text: text.trim(), by: 'agent', at: isoWithOffset(now()), retracted: false });
      return { change: id, card };
    },

    // A roster change, written as a `changes` record with the card in one pinned batch. Only after
    // the Commander confirms. `add` takes no tid and creates the Trainee.
    updateTrainee(tid, change = {}) {
      const docs = open();
      const kinds = Object.keys(change);
      if (kinds.length !== 1 || !TRAINEE_CHANGES.includes(kinds[0])) {
        throw new StoreError(`a Trainee change is one of ${TRAINEE_CHANGES.join(', ')}`);
      }
      const [kind] = kinds;
      const value = change[kind] ?? {};
      if (kind === 'add' && tid) throw new StoreError('adding takes no Trainee id');
      if (kind !== 'add' && !docs.get(`trainees/${tid}`)) throw new StoreError(`unknown Trainee ${tid}`);
      const at = isoWithOffset(now());

      if (kind === 'add' || kind === 'rename') {
        const name = freeName(docs, value.name, tid);
        if (kind === 'add') {
          let id;
          do id = `t-${rand(6)}`; while (docs.taken(`trainees/${id}`));
          const added = { type: 'added', name, by: 'commander', at, retracted: false };
          const card = deriveCard({ changes: [added], evidence: [] });
          docs.batch([
            { op: 'create', path: `trainees/${id}/changes/added`, data: added },
            { op: 'create', path: `trainees/${id}`, data: card },
          ]);
          return { id, ...card };
        }
        return writeChange(docs, tid, { type: 'renamed', name, by: 'commander', at, retracted: false });
      }
      const { left } = docs.get(`trainees/${tid}`).data;
      if (kind === 'status') {
        checkActive(docs, tid, false);
        const { to, reason, evidence = [], ...rest } = value;
        if (Object.keys(rest).length) throw new StoreError('a Status change takes only to, reason and evidence');
        const ids = evidence.map((ref) => {
          if (!evidenceOf(docs, tid, ref)) throw new StoreError(`"${ref}" is no Evidence of ${tid}; cite stored Evidence ids`);
          return ref;
        });
        const from = statusMove(docs.get(`trainees/${tid}`).data, to, reason);
        checkDisplaySafe([reason], leaksFor(docs, tid));
        return writeChange(docs, tid, { type: 'status', from, to, by: 'commander', reason: reason.trim(), evidence: ids, at, retracted: false });
      }
      if (kind === 'rejoin') {
        if (!left) throw new StoreError(`${tid} has not left`);
        return writeChange(docs, tid, { type: 'rejoined', by: 'commander', at, retracted: false });
      }
      if (left) throw new StoreError(`${tid} already left on ${left.date}`);
      const { date, how, reason, ...rest } = value;
      if (Object.keys(rest).length) throw new StoreError('leaving takes only date, how and reason');
      checkDate(date);
      if (date > today()) throw new StoreError(`${date} is in the future; record leaving on the day it happened`);
      if (!LEAVE_HOW.includes(how)) throw new StoreError(`how a Trainee left is one of ${LEAVE_HOW.join(', ')}, got "${how}"`);
      if (typeof reason !== 'string' || !reason.trim()) throw new StoreError('leaving needs a reason (display-safe: no sensitive detail)');
      checkDisplaySafe([reason], leaksFor(docs, tid));
      return writeChange(docs, tid, { type: 'left', date, how, reason: reason.trim(), by: 'commander', at, retracted: false });
    },

    // Saves a new Playbook item of the Commander's (no `id`) or edits one (`id`): the item as
    // stored, with its id. Only after the Commander confirms.
    savePlaybookItem({ id, ...given } = {}) {
      const docs = open();
      const framework = docs.get('meta/skills')?.data;
      const at = isoWithOffset(now());
      if (id === undefined) {
        const item = ownItem(given, framework);
        checkSource(docs, item);
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const pid = `p-${rand(4)}`;
          if (docs.get(`playbook/${pid}`)) continue;
          try {
            docs.batch([{ op: 'create', path: `playbook/${pid}`, data: { ...item, at, retired: false } }]);
            return { id: pid, ...docs.get(`playbook/${pid}`).data };
          } catch (e) {
            if (!(e instanceof AlreadyExists)) throw e;
          }
        }
        throw new StoreError('could not find a free Playbook item id; try again');
      }
      if (/^b-/.test(id)) throw new StoreError(`${id} is a base Playbook item: it is never changed, only hidden`);
      if (!OWN_ID.test(id)) throw new StoreError(`no Playbook item ${id} of the Commander's`);
      if (given.source !== undefined) throw new StoreError('the source Entry of an item does not change');
      if (!Object.keys(given).length) throw new StoreError('nothing to change');
      const data = pinned(docs, `playbook/${id}`, (current) => {
        if (current.retired) throw new StoreError(`${id} is retired; save a new item instead`);
        return { ...current, ...ownItem(given, framework, current), edited: at };
      }, `no Playbook item ${id} of the Commander's`);
      return { id, ...data };
    },

    // Retires one of the Commander's Playbook items: it stays stored, out of Advice. Only after
    // the Commander confirms.
    retirePlaybookItem(id) {
      if (/^b-/.test(id ?? '')) throw new StoreError(`${id} is a base Playbook item: hide it instead`);
      if (!OWN_ID.test(id ?? '')) throw new StoreError(`no Playbook item ${id} of the Commander's`);
      const data = pinned(open(), `playbook/${id}`, (current) => {
        if (current.retired) throw new StoreError(`${id} is already retired`);
        return { ...current, retired: { at: isoWithOffset(now()) } };
      }, `no Playbook item ${id} of the Commander's`);
      return { id, ...data };
    },

    // Hides a base Playbook item from the Commander's Advice (`hidden: true`) or brings it back
    // (`false`). Returns `commander/hides`. Hiding twice, or un-hiding what is not hidden, is
    // harmless. Only after the Commander confirms.
    hidePlaybookItem(baseId, hidden) {
      if (typeof hidden !== 'boolean') throw new StoreError('hidePlaybookItem takes hidden: true or false');
      if (OWN_ID.test(baseId ?? '')) throw new StoreError(`${baseId} is the Commander's own item: retire it instead`);
      const docs = open();
      if (hidden && !base(docs.get('meta/skills')?.data).some((i) => i.id === baseId)) {
        throw new StoreError(`no base Playbook item ${baseId}`);
      }
      const current = docs.get('commander/hides')?.data?.hidden ?? [];
      if (hidden === current.includes(baseId)) return { hidden: current };
      return pinned(docs, 'commander/hides', (h) => ({
        ...h,
        hidden: hidden ? [...new Set([...(h.hidden ?? []), baseId])] : (h.hidden ?? []).filter((x) => x !== baseId),
      }));
    },

    // Commander name, role, Talk target and thresholds. Only after the Commander confirms.
    updateSettings(change = {}) {
      const { name, role, talk, ...rest } = change;
      const unknown = Object.keys(rest)[0];
      if (unknown) throw new StoreError(`unknown setting "${unknown}" (name, role, talk)`);
      if (!Object.keys(change).length) throw new StoreError('nothing to change');
      if (name !== undefined && (typeof name !== 'string' || !name.trim())) throw new StoreError('the Commander name cannot be empty');
      if (role !== undefined && role !== null && typeof role !== 'string') throw new StoreError('role is text, or null to clear it');
      return pinned(open(), 'commander/settings', (current) => ({
        ...current,
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(role !== undefined ? { role: role?.trim() || null } : {}),
        talk: talkSettings(current.talk, talk),
        at: isoWithOffset(now()),
      }));
    },

    // One change to this Cycle (its preset copy, Skill framework or Project teams), pinned to the
    // version read. Only after the Commander confirms. Returns the changed document.
    updateCycle(change = {}) {
      const kinds = Object.keys(change);
      const apply = CYCLE_CHANGES[kinds[0]];
      if (kinds.length !== 1 || !apply) throw new StoreError(`a Cycle change is one of ${Object.keys(CYCLE_CHANGES).join(', ')}`);
      return apply(open(), change[kinds[0]] ?? {}, { rand, at: isoWithOffset(now()) });
    },

    // Moves one Evidence, with the Follow-ups it opened, between the sensitive collection and the
    // Trainee's records: same ids, one version-pinned batch with the rebuilt card. Moving in needs
    // a category.
    flipSensitive(evidenceId, { category } = {}) {
      const docs = open();
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const sensitiveDoc = docs.get(`sensitive/${evidenceId}`);
        // A record cut from an Entry is about one of the Entry's Trainees; its id names the Entry.
        const tids = docs.get(`entries/${entryOfRecord(evidenceId)}`)?.data.trainees ?? [];
        // Found through the Trainee's lists, the reads their card is derived from anyway.
        // Every one of them is looked at, so the reads a flip needs don't hang on what they find.
        const inList = (t, kind) => docs.list(`trainees/${t}/${kind}`).find((d) => d.id === evidenceId);
        const holding = (kind) => tids.filter((t) => inList(t, kind));
        const [followup, item, evidenceOwner] = ['followups', 'items', 'evidence'].map(holding);
        if (sensitiveDoc?.data.record === 'followup' || followup.length) {
          throw new StoreError(`${evidenceId} is a Follow-up; flip the Evidence it was opened from`);
        }
        if (sensitiveDoc?.data.record === 'item' || item.length) {
          throw new StoreError(`${evidenceId} is an improve/keep item; flip the Evidence it was taken from`);
        }
        const tid = sensitiveDoc?.data.trainee ?? evidenceOwner[0];
        if (!tid) throw new StoreError(`no Evidence ${evidenceId}`);
        // An Entry still being written would recreate the record at its old place: finish it first.
        const { entry } = (sensitiveDoc ?? inList(tid, 'evidence')).data;
        if (docs.get(`entries/${entry}`)?.data.status === 'writing') {
          finishEntry(docs, entry);
          continue;
        }
        const toPublic = Boolean(sensitiveDoc);
        const evidence = toPublic ? sensitiveDoc : docs.get(`trainees/${tid}/evidence/${evidenceId}`);
        if (evidence.data.retracted !== false) throw new StoreError(`${evidenceId} is retracted; it no longer counts or shows`);
        if (!toPublic && !FLIP_CATEGORIES.includes(category)) {
          throw new StoreError(`marking sensitive needs a category (one of ${FLIP_CATEGORIES.join(', ')})`);
        }
        // The Follow-ups opened from it and the improve/keep items taken from it move with it.
        const followers = Object.entries(RECORD_OF).flatMap(([kind, record]) => (toPublic
          ? docs.query('sensitive', [['trainee', '==', tid]]).filter((d) => d.data.record === record && d.data.from === evidenceId)
          : docs.list(`trainees/${tid}/${kind}`).filter((d) => d.data.from === evidenceId)
        ).map((d) => ({ id: d.id, kind, doc: d })));
        const from = (rid, kind) => (toPublic ? `sensitive/${rid}` : `trainees/${tid}/${kind}/${rid}`);
        const to = (rid, kind) => (toPublic ? `trainees/${tid}/${kind}/${rid}` : `sensitive/${rid}`);
        const moves = [
          { id: evidenceId, kind: 'evidence', doc: evidence },
          ...followers,
        ].map(({ id: rid, kind, doc }) => {
          const { record, category: c, ...data } = doc.data;
          const moved = toPublic ? data : { record: RECORD_OF[kind] ?? 'evidence', ...data, ...(kind === 'evidence' ? { category } : {}) };
          return { from: from(rid, kind), to: to(rid, kind), version: doc.version, data: moved };
        });
        const card = docs.get(`trainees/${tid}`);
        // The card as it will be once the records have moved.
        const removed = new Set(moves.map((m) => m.from));
        const after = moves.map((m) => ({ path: m.to, data: m.data }));
        const next = derive(docs, tid, after, removed);
        try {
          docs.batch([
            ...moves.map((m) => ({ op: 'delete', path: m.from, ifVersion: m.version })),
            ...moves.map((m) => ({ op: 'create', path: m.to, data: m.data })),
            { op: 'set', path: `trainees/${tid}`, data: next, ifVersion: card.version },
          ]);
          const repeats = toPublic ? [] : cardRepeats(next, leaksFor(docs, tid));
          return { id: evidenceId, now: toPublic ? 'public' : 'sensitive', moved: moves.map((m) => m.to.split('/').at(-1)), ...(repeats.length ? { repeats } : {}) };
        } catch (e) {
          if (!lostRace(e)) throw e;
        }
      }
      throw new StoreError(`${evidenceId} kept changing; try again`);
    },

    // Retracts the named Entry, or the last one written: the Entry is marked first
    // (`retracted: {at}`, `retraction: writing`), then everything cut from it is flagged Trainee
    // by Trainee with the rebuilt cards, then `retraction: done`. Nothing is deleted or edited.
    retractEntry(eid) {
      const docs = open();
      const id = entryToWithdraw(docs, eid);
      writeEntry(docs, id, ({ data }) => {
        if (data.retraction === 'done') throw new StoreError(`Entry ${id} is already retracted`);
        if (data.retraction === 'writing') return null; // an earlier session started it
        return { op: 'update', data: { retracted: { at: isoWithOffset(now()) }, retraction: 'writing' } };
      });
      const { trainees, children } = docs.get(`entries/${id}`).data;
      finishWithdrawal(docs, id, RETRACT);
      return { entry: id, trainees, retracted: children };
    },

    // Permanently removes an Entry and everything cut from it, rebuilding the cards. Only on the
    // Commander's explicit request, after they confirmed.
    hardDelete(eid) {
      if (!eid) throw new StoreError('hardDelete needs the id of the Entry to delete');
      const docs = open();
      const id = entryToWithdraw(docs, eid);
      const { trainees, children } = docs.get(`entries/${id}`).data;
      writeEntry(docs, id, () => ({ op: 'update', data: { deletion: 'writing' } }));
      finishWithdrawal(docs, id, DELETE);
      return { entry: id, trainees, deleted: children };
    },

    // Finish every Entry, Retraction and hard delete an earlier session left at `writing`.
    // Returns the Entry ids.
    resumePending() {
      return { finished: finishPending(open()) };
    },

    // Setup of a new Cycle, after createCycle: copies the Commander's scope from the Cycle it
    // follows. Playbook items keep their ids (one already here is left as it is), hides are
    // merged in, settings are copied only when this Cycle has none (setup seeded them from the
    // answers, prefilled from the previous Cycle), and a Skill the Commander added that a live
    // item is tagged to joins the same group. Copying again copies nothing.
    copyCommanderScope(fromUrl) {
      if (fromUrl === readPointer().current) throw new StoreError('copyCommanderScope copies from the previous Cycle into the current Cycle, not from the current Cycle itself');
      const docs = open();
      const from = cycleAt(fromUrl, 'copy from');
      if (docs.get('meta/cycle')?.data.setup !== 'in-progress') {
        throw new StoreError('copyCommanderScope runs only while setup of a new Cycle is in progress; this Cycle\'s setup is done');
      }
      const at = isoWithOffset(now());
      let settings = 'kept';
      const theirs = from.get('commander/settings')?.data;
      if (theirs && !docs.get('commander/settings')) {
        docs.batch([{ op: 'create', path: 'commander/settings', data: { ...theirs, at } }]);
        settings = 'copied';
      }

      // Skills the Commander added there that a live item is tagged to; one of the same name in
      // that group here stands in for it.
      const items = from.list('playbook');
      const oldSkills = from.get('meta/skills')?.data.groups ?? [];
      const wanted = new Set(items.filter((i) => !i.data.retired).flatMap((i) => i.data.skills));
      const retag = {};
      const addedSkills = [];
      const here = new Set((docs.get('meta/skills')?.data.groups ?? []).flatMap((g) => g.skills.map((k) => k.id)));
      const lacking = oldSkills.some((o) => o.skills.some((k) => wanted.has(k.id) && !here.has(k.id)));
      if (lacking) pinned(docs, 'meta/skills', (framework) => ({
        ...framework,
        groups: framework.groups.map((g) => {
          const old = oldSkills.find((o) => o.id === g.id);
          const extra = (old?.skills ?? []).filter((k) => wanted.has(k.id) && !g.skills.some((x) => x.id === k.id));
          const fresh = extra.filter((k) => {
            const same = g.skills.find((x) => sameName(x.name, k.name));
            if (same) retag[k.id] = same.id;
            return !same;
          });
          addedSkills.push(...fresh.map((k) => k.id));
          return fresh.length ? { ...g, skills: [...g.skills, ...fresh] } : g;
        }),
      }));

      const missing = items.filter((i) => !docs.get(`playbook/${i.id}`));
      for (let k = 0; k < missing.length; k += MAX_BATCH_WRITES) {
        docs.batch(missing.slice(k, k + MAX_BATCH_WRITES).map((i) => ({
          op: 'create',
          path: `playbook/${i.id}`,
          data: { ...i.data, skills: [...new Set(i.data.skills.map((sk) => retag[sk] ?? sk))] },
        })));
      }

      const theirHides = from.get('commander/hides')?.data.hidden ?? [];
      const ours = docs.get('commander/hides')?.data.hidden ?? [];
      const hidden = theirHides.filter((h) => !ours.includes(h));
      if (hidden.length) {
        if (docs.get('commander/hides')) pinned(docs, 'commander/hides', (h) => ({ ...h, hidden: [...new Set([...(h.hidden ?? []), ...hidden])] }));
        else docs.batch([{ op: 'create', path: 'commander/hides', data: { hidden } }]);
      }
      return { settings, skills: addedSkills, playbook: missing.map((i) => i.id), hidden };
    },

    // Setup of a new Cycle, after copyCommanderScope: the previous Cycle goes into the pointer's
    // `archived` (if not there yet), anything an earlier session left half-written there is
    // finished (nothing can write to it later), and it is marked `archived: true`, read-only
    // from then on. Archiving again is harmless. Returns its meta/cycle.
    archiveCycle(url) {
      const pointer = readPointer();
      if (url === pointer.current) throw new StoreError('the current Cycle cannot be archived; archive the previous one once the new Cycle is the current Cycle');
      const docs = cycleAt(url, 'archive');
      if (!pointer.archived.includes(url)) writeJson(pointerPath, { ...pointer, archived: [...pointer.archived, url] });
      finishPending(docs);
      const cycle = docs.get('meta/cycle').data;
      if (cycle.archived === true) return cycle;
      return pinned(docs, 'meta/cycle', (c) => ({ ...c, archived: true, archivedAt: isoWithOffset(now()) }));
    },

    rebuildCard(tid) {
      const docs = open();
      if (!docs.list(`trainees/${tid}/changes`).length) throw new StoreError(`unknown Trainee ${tid}`);
      return rebuildCard(docs, tid);
    },
  };
}

// Checks an Evidence's kind-specific fields against its kind and the Cycle's preset; returns
// them with every field of the kind present (absent ones at their default).
function kindFields(ev, preset, teams = []) {
  const { trainee, kind, date, excerpt, ...fields } = ev;
  const allowed = { ...KIND_FIELDS[kind], closes: [] };
  for (const key of Object.keys(fields)) {
    if (!(key in allowed)) throw new StoreError(`field "${key}" does not belong to a ${kind} Evidence`);
  }
  const out = { ...allowed, ...fields };
  if ('score' in fields && (typeof out.score !== 'number' || Number.isNaN(out.score))) {
    throw new StoreError(`score must be a number, as the Commander gave it; leave it out when not given`);
  }
  if ('test' in allowed && out.test) out.subject = testSubject(out, preset);
  if ('project' in allowed && out.project) checkProject(preset, out.project);
  // A project observation links to the Trainee's team in that Project, if one is recorded.
  if ('project' in allowed) out.team = teams.find((t) => t.project === out.project && t.members.includes(trainee))?.id ?? null;
  return out;
}

// Names compare ignoring case and spacing.
const sameName = (a, b) => {
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(a) === norm(b);
};

// The preset Test known by this name or alias (ignoring case and spacing), if any.
// The Project known by `name` (or alias; or id, with byId), or undefined.
function findProject(preset, name, { byId = false } = {}) {
  return preset.projects.find((p) => [...(byId ? [p.id] : []), p.name, ...(p.aliases ?? [])].some((n) => sameName(n, name)));
}

function findTest(preset, name) {
  return (preset?.tests ?? []).find((t) => [t.name, ...t.aliases].some((a) => sameName(a, name)));
}

// The preset Test by name or alias, or a refusal.
function testNamed(preset, name) {
  const found = findTest(preset, name ?? '');
  if (!found) throw new StoreError(`no Test "${name}" in this Cycle's preset`);
  return found;
}

// Checks an Evidence's `test` against the preset; returns the Subject to store (a listed Test's own).
function testSubject(ev, preset) {
  const canonical = (preset?.tests ?? []).find((t) => t.name === ev.test);
  if (ev.unlisted) {
    if (canonical) throw new StoreError(`"${ev.test}" is in the preset; drop unlisted`);
    return ev.subject;
  }
  if (!canonical) {
    const byAlias = findTest(preset, ev.test);
    if (byAlias) throw new StoreError(`"${ev.test}" is the Test "${byAlias.name}"; pass its canonical name`);
    throw new StoreError(`"${ev.test}" is not in the Cycle's preset; record it as written with unlisted, and ask the Commander`);
  }
  if (ev.subject && ev.subject !== canonical.subject) {
    throw new StoreError(`"${ev.test}" belongs to Subject ${canonical.subject}, not ${ev.subject}`);
  }
  return canonical.subject;
}

// A public excerpt may stand for its Entry with sensitive parts cut out: each piece around a
// MARK is copied from the Entry, in order. A MARK alone stands for a wholly sensitive Evidence.
function wordForWord(text, excerpt) {
  if (!excerpt) return false;
  if (!excerpt.includes(MARK)) return text.includes(excerpt);
  const pieces = excerpt.split(MARK).map((p) => p.trim()).filter(Boolean);
  let from = 0;
  for (const p of pieces) {
    const at = text.indexOf(p, from);
    if (at === -1) return false;
    from = at + p.length;
  }
  return true;
}

// The Trainee's Evidence by that id, public or sensitive, as {id, date, kind}; null if there is none.
function evidenceOf(docs, tid, id) {
  const pub = docs.get(`trainees/${tid}/evidence/${id}`)?.data;
  // Among the Trainee's sensitive records, the reads the card needs anyway.
  const s = pub ? null : sensitiveOf(docs, tid).find((x) => x.id === id);
  const found = pub ?? (s?.record === 'evidence' ? s : null);
  return found?.retracted === false ? { id, date: found.date, kind: found.kind, sensitive: !pub } : null;
}

// How a Retraction and a hard delete withdraw an Entry's records: which still need it, the write
// for each, the record as the card should see it afterwards, and the write that closes the Entry.
const RETRACT = {
  pending: (r) => r.data.retracted === false,
  write: (r) => ({ op: 'update', path: r.path, data: { retracted: true }, ifVersion: r.version }),
  after: (r) => [{ path: r.path, data: { ...r.data, retracted: true } }],
  close: ({ data }) => (data.retraction === 'done' ? null : { op: 'update', data: { retraction: 'done' } }),
};
const DELETE = {
  pending: () => true,
  write: (r) => ({ op: 'delete', path: r.path, ifVersion: r.version }),
  after: () => [],
  close: () => ({ op: 'delete' }),
};

// The records that follow their Evidence into and out of `sensitive/`: subcollection → `record`.
const RECORD_OF = { followups: 'followup', items: 'item' };

// Subcollections that hold records cut from an Entry.
const CHILD_KINDS = ['evidence', 'followups', 'assessments', 'items', 'changes'];

// Where each of `ids` that belongs to this Trainee is now, as {path, version, data}: in their
// subcollections, or in `sensitive/` wherever a flip has moved it.
// Looked up among the reads the card is derived from anyway (lists and the sensitive query).
function childrenOf(docs, tid, ids) {
  const found = [
    ...CHILD_KINDS.flatMap((k) => docs.list(`trainees/${tid}/${k}`).map((d) => ({ path: `trainees/${tid}/${k}/${d.id}`, ...d }))),
    ...docs.query('sensitive', [['trainee', '==', tid]]).map((d) => ({ path: `sensitive/${d.id}`, ...d })),
  ];
  return ids.flatMap((cid) => {
    const doc = found.find((d) => d.id === cid && d.data.trainee === tid);
    return doc ? [{ path: doc.path, version: doc.version, data: doc.data }] : [];
  });
}

// The Entry a record cut from it belongs to: its id less the record's number (`<entry id>-<n>`).
const entryOfRecord = (id) => String(id).replace(/-\d+$/, '');

// The changes `updateCycle` makes, each (docs, value, {rand, at}) → the changed document.
const CYCLE_CHANGES = {
  addTest: (docs, { name, subject, number = null, aliases = [] }, { rand }) => pinned(docs, 'meta/preset', (preset) => {
    if (!name) throw new StoreError('addTest needs a name');
    checkSubject(preset, subject);
    for (const n of [name, ...aliases]) {
      const taken = findTest(preset, n);
      if (taken) throw new StoreError(`"${n}" is already the Test "${taken.name}"`);
    }
    const slug = slugOf(name) || `t-${rand(4)}`;
    let id = `${subject}.${slug}`;
    while (preset.tests.some((t) => t.id === id)) id = `${subject}.${slug}-${rand(2)}`;
    return { ...preset, tests: [...preset.tests, { id, subject, number, name, aliases }] };
  }),

  // A rename keeps the old name as an alias, so Evidence recorded under it still resolves.
  editTest: (docs, { test, name, number, aliases = [], ...rest }) => pinned(docs, 'meta/preset', (preset) => {
    if (Object.keys(rest).length) throw new StoreError('editTest takes test, name, number and aliases');
    const current = testNamed(preset, test);
    if (name === undefined && number === undefined && !aliases.length) throw new StoreError('nothing to change');
    const renamed = name !== undefined && name !== current.name;
    for (const n of [...(renamed ? [name] : []), ...aliases]) {
      const taken = findTest(preset, n);
      if (taken && taken.id !== current.id) throw new StoreError(`"${n}" is already the Test "${taken.name}"`);
    }
    const finalName = renamed ? name : current.name;
    const next = {
      ...current,
      name: finalName,
      ...(number !== undefined ? { number } : {}),
      aliases: [...new Set([...current.aliases, ...(renamed ? [current.name] : []), ...aliases])].filter((a) => !sameName(a, finalName)),
    };
    return { ...preset, tests: preset.tests.map((t) => (t.id === current.id ? next : t)) };
  }),

  removeTest: (docs, { test }) => pinned(docs, 'meta/preset', (preset) => {
    const current = testNamed(preset, test);
    return { ...preset, tests: preset.tests.filter((t) => t.id !== current.id) };
  }),

  addProject: (docs, { name, subject, aliases = [] }, { rand }) => pinned(docs, 'meta/preset', (preset) => {
    if (typeof name !== 'string' || !name.trim()) throw new StoreError('a Project needs a name');
    checkSubject(preset, subject);
    for (const n of [name, ...aliases]) {
      const taken = findProject(preset, n);
      if (taken) throw new StoreError(`"${n}" is already the Project "${taken.name}"`);
    }
    const slug = slugOf(name) || `p-${rand(4)}`;
    let id = slug;
    while (preset.projects.some((p) => p.id === id)) id = `${slug}-${rand(2)}`;
    return { ...preset, projects: [...preset.projects, { id, subject, name: name.trim(), aliases }] };
  }),

  // Recorded Evidence keeps its Project id; a Project that still has a team is refused.
  removeProject: (docs, { project }) => pinned(docs, 'meta/preset', (preset) => {
    const current = findProject(preset, project ?? '', { byId: true });
    if (!current) throw new StoreError(`no Project "${project}" (one of ${preset.projects.map((p) => p.name).join(', ')})`);
    const team = docs.list('teams').find((t) => t.data.project === current.id);
    if (team) throw new StoreError(`${current.name} has the team "${team.data.name}"; it stays`);
    const schedule = preset.schedule.map(({ projects, ...w }) => {
      const left = (projects ?? []).filter((p) => p !== current.id);
      return { ...w, ...(left.length ? { projects: left } : {}) };
    });
    return { ...preset, projects: preset.projects.filter((p) => p.id !== current.id), schedule };
  }),

  removeWeek: (docs, { week }) => pinned(docs, 'meta/preset', (preset) => {
    if (!preset.schedule.some((w) => w.week === week)) throw new StoreError(`no week ${week} in the Schedule`);
    const last = Math.max(...preset.schedule.map((w) => w.week));
    if (week !== last) throw new StoreError(`only the last week (${last}) can be dropped; change week ${week} with setWeek`);
    return { ...preset, schedule: preset.schedule.filter((w) => w.week !== week) };
  }),

  setWeek: (docs, { week, subjects = [], projects }) => pinned(docs, 'meta/preset', (preset) => {
    if (!Number.isInteger(week) || week < 1) throw new StoreError(`a week is a whole number from 1, got ${JSON.stringify(week)}`);
    for (const s of subjects) checkSubject(preset, s);
    for (const p of projects ?? []) checkProject(preset, p);
    const entry = { week, subjects, ...(projects?.length ? { projects } : {}) };
    const schedule = [...preset.schedule.filter((w) => w.week !== week), entry].sort((a, b) => a.week - b.week);
    return { ...preset, schedule };
  }),

  addSkill: (docs, { group, name }, { rand, at }) => {
    let skill;
    const skills = pinned(docs, 'meta/skills', (framework) => {
      const g = groupOf(framework, group);
      if (typeof name !== 'string' || !name.trim()) throw new StoreError('a Skill needs a name');
      const same = g.skills.find((k) => sameName(k.name, name));
      if (same) throw new StoreError(`there is already a Skill "${same.name}" (${same.id}${same.archived ? ', archived: restore it instead' : ''})`);
      const ids = new Set(framework.groups.flatMap((x) => x.skills.map((k) => k.id)));
      let id;
      do id = `${g.id}.c-${rand(4)}`; while (ids.has(id));
      skill = { id, name: name.trim(), added: at };
      return withSkills(framework, g.id, [...g.skills, skill]);
    });
    return { skill, skills };
  },

  // Creates a Project team, or replaces the one named by `id`. A Trainee is in one team per Project.
  setTeam: (docs, { id, project, name, members = [], ...rest }, { rand, at }) => {
    if (Object.keys(rest).length) throw new StoreError('setTeam takes id, project, name and members');
    checkProject(docs.get('meta/preset')?.data, project);
    if (typeof name !== 'string' || !name.trim()) throw new StoreError('a team needs a name');
    if (!members.length) throw new StoreError('a team has at least one member');
    const current = id ? docs.get(`teams/${id}`) : null;
    if (id && !current) throw new StoreError(`no team ${id}`);
    for (const tid of members) {
      const card = docs.get(`trainees/${tid}`);
      if (!card) throw new StoreError(`unknown Trainee ${tid}`);
      const other = docs.list('teams').find((t) => t.id !== id && t.data.project === project && t.data.members.includes(tid));
      if (other) throw new StoreError(`${card.data.name} is already in "${other.data.name}" for ${project}; change that team first`);
    }
    const data = { project, name: name.trim(), members: [...new Set(members)], at };
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let teamId = id;
      if (!teamId) do teamId = `tm-${rand(4)}`; while (docs.taken(`teams/${teamId}`));
      try {
        upsert(docs, `teams/${teamId}`, data, id ? docs.get(`teams/${id}`) : null);
        return { id: teamId, ...data };
      } catch (e) {
        if (!lostRace(e)) throw e;
      }
    }
    throw new StoreError('the teams kept changing; try again');
  },

  archiveSkill: (docs, { skill }, { at }) => setArchived(docs, skill, at),
  restoreSkill: (docs, { skill }) => setArchived(docs, skill, null),
};

// A Playbook item taken from an Entry: that Entry is live, holds the text word-for-word, and the
// text repeats none of its sensitive parts (the Playbook outlives the Cycle and feeds Advice).
function checkSource(docs, item) {
  if (item.source === null) return;
  const entry = docs.get(`entries/${item.source}`)?.data;
  if (!entry || entry.deletion) throw new StoreError(`no Entry ${item.source}`);
  if (entry.retracted !== false) throw new StoreError(`Entry ${item.source} is retracted`);
  if (!entry.text.includes(item.text)) throw new StoreError(`the text is not word-for-word from Entry ${item.source}`);
  const parts = flat(docs.list('sensitive')).filter((x) => x.entry === item.source && x.record === 'evidence').map((x) => x.excerpt);
  const spans = parts.flatMap((p) => spansOf(entry.text, p));
  const at = spansOf(entry.text, item.text);
  if (repeatsSensitive(entry.text, parts, spans)(item.text) || spans.some((sp) => at.some((t) => overlaps(sp, t)))) {
    throw new StoreError('the text repeats a sensitive part of its Entry; a Playbook item carries none');
  }
}

// The Commander's Playbook item ids, `p-<rand4>`.
const OWN_ID = /^p-[a-z0-9]+$/;

// The Talk target and thresholds after `change`, refusing values that make no sense.
function talkSettings(current, change = {}) {
  const unknown = Object.keys(change).find((k) => !(k in DEFAULT_TALK));
  if (unknown) throw new StoreError(`unknown Talk setting "${unknown}" (target, yellow, red)`);
  const next = { ...current, ...change };
  for (const k of Object.keys(DEFAULT_TALK)) {
    if (!Number.isInteger(next[k]) || next[k] < 1) throw new StoreError(`Talk ${k} is a whole number of days, at least 1; got ${JSON.stringify(next[k])}`);
  }
  if (next.yellow >= next.red) throw new StoreError(`the yellow threshold (${next.yellow}) must come before red (${next.red})`);
  if (next.target > next.yellow) throw new StoreError(`the Talk target (${next.target}) cannot be past the yellow threshold (${next.yellow})`);
  return next;
}

function checkProject(preset, project) {
  if (!preset?.projects.some((p) => p.id === project)) {
    throw new StoreError(`unknown project "${project}" (one of ${preset?.projects.map((p) => p.id).join(', ')})`);
  }
}

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new StoreError(`date must be YYYY-MM-DD, got "${date}"`);
}

function checkSubject(preset, subject) {
  if (!preset.subjects.some((s) => s.id === subject)) {
    throw new StoreError(`unknown Subject "${subject}" (one of ${preset.subjects.map((s) => s.id).join(', ')})`);
  }
}

function groupOf(framework, group) {
  const g = framework.groups.find((x) => x.id === group);
  if (!g) throw new StoreError(`unknown Stage or group "${group}" (one of ${framework.groups.map((x) => x.id).join(', ')})`);
  return g;
}

const withSkills = (framework, group, skills) => ({
  ...framework,
  groups: framework.groups.map((g) => (g.id === group ? { ...g, skills } : g)),
});

// Archives a Skill (`at` = when) or restores it (`at` = null). Never deleted: its Assessments keep their meaning.
function setArchived(docs, id, at) {
  let skill;
  const skills = pinned(docs, 'meta/skills', (framework) => {
    const g = framework.groups.find((x) => x.skills.some((k) => k.id === id));
    if (!g) throw new StoreError(`unknown Skill "${id}"`);
    const { archived, archivedAt, ...current } = g.skills.find((k) => k.id === id);
    if (at && archived) throw new StoreError(`${id} is already archived`);
    if (!at && !archived) throw new StoreError(`${id} is not archived`);
    skill = at ? { ...current, archived: true, archivedAt: at } : current;
    return withSkills(framework, g.id, g.skills.map((k) => (k.id === id ? skill : k)));
  });
  return { skill, skills };
}

const AUTHORS = ['agent', 'commander', 'trainee'];
const TRAINEE_CHANGES = ['add', 'rename', 'leave', 'rejoin', 'status'];
const LEAVE_HOW = ['dismissal', 'transfer', 'other'];

// A Trainee who left takes no new records unless the Commander insists.
function checkActive(docs, tid, insist) {
  const card = docs.get(`trainees/${tid}`)?.data;
  if (card?.left && !insist) {
    throw new StoreError(`${card.name} left on ${card.left.date}; their records are read-only. Record only if the Commander insists (insist)`);
  }
}

// `name` trimmed, if it clashes with no other Trainee's (one who left included); `self` may keep its own.
function freeName(docs, name, self) {
  if (typeof name !== 'string' || !name.trim()) throw new StoreError('a Trainee needs a display name');
  for (const t of docs.list('trainees')) {
    if (t.id !== self) checkNames(t.data.name, name.trim());
  }
  return name.trim();
}

// Two display names clash when they are the same (ignoring case and spacing), or when one is a
// bare first name the other starts with: then a bare "נועה" could mean either.
function checkNames(a, b) {
  const words = (n) => n.trim().split(/\s+/);
  if (sameName(a, b)) throw new StoreError(`there is already a Trainee named "${a}"; ask for a short distinguishing label for both (e.g. "נועה כ.")`);
  const [wa, wb] = [words(a), words(b)];
  if ((wa.length === 1 || wb.length === 1) && sameName(wa[0], wb[0])) {
    throw new StoreError(`"${wa.length === 1 ? a : b}" shares the first name of "${wa.length === 1 ? b : a}"; give both a short distinguishing label (e.g. "נועה כ.")`);
  }
}

// Checks Assessments against the Skill framework; `cite(ref, tid)` resolves a cited ref to that
// Trainee's Evidence {id, date, kind}, or null. Returns each with its Evidence ids, dated by the latest.
function checkAssessments(docs, assessments, cite) {
  const known = new Map((docs.get('meta/skills')?.data.groups ?? []).flatMap((g) => g.skills.map((k) => [k.id, k])));
  const seen = new Set();
  return assessments.map((a) => {
    const { trainee, skill, score, author, reason, evidence = [], ...rest } = a;
    if (Object.keys(rest).length) throw new StoreError(`an Assessment takes only trainee, skill, score, author, reason and evidence`);
    if (!docs.get(`trainees/${trainee}`)) throw new StoreError(`unknown Trainee ${trainee}`);
    if (!known.has(skill)) throw new StoreError(`unknown Skill "${skill}"; use a Skill id from meta/skills`);
    if (known.get(skill).archived) throw new StoreError(`${skill} is archived; restore it (restoreSkill, after the Commander confirms) before assessing it`);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new StoreError(`an Assessment score is a whole number from 1 to 5, got ${JSON.stringify(score)}`);
    if (!AUTHORS.includes(author)) throw new StoreError(`author is one of ${AUTHORS.join(', ')}, got "${author}"`);
    if (typeof reason !== 'string' || !reason.trim()) throw new StoreError('an Assessment needs a reason');
    if (!evidence.length) throw new StoreError('an Assessment rests on at least one Evidence');
    const key = `${trainee} ${skill} ${author}`;
    if (seen.has(key)) throw new StoreError(`${skill} of ${trainee} is assessed twice by the ${author}; write one holistic Assessment`);
    seen.add(key);
    const cited = evidence.map((ref) => {
      const found = cite(ref, trainee);
      if (!found) throw new StoreError(`"${ref}" is no Evidence of ${trainee} (cite this Entry's Evidence as #<n>, or a stored Evidence id)`);
      return found;
    });
    if (author === 'trainee' && !cited.some((c) => c.kind === 'self-assessment')) {
      throw new StoreError('a Trainee\'s own Assessment comes from their self-assessment form: cite that self-assessment Evidence');
    }
    return { trainee, skill, score, author, reason, evidence: cited.map((c) => c.id), date: cited.map((c) => c.date).sort().at(-1) };
  });
}

const STATUSES = ['good', 'watch', 'concern'];
const EVAL_STAGES = ['רף מקס', 'רף רמד', 'רף מפקד היחידה', 'הדחה'];
const STATE_TYPES = ['status', 'stage', 'snapshot', 'retired', 'nextTalk'];
const ITEM_KINDS = ['improve', 'keep'];
const ITEM_AUTHORS = ['agent', 'commander'];

// Trainee state goes with the Evidence about that Trainee in the same Entry.
function checkTouched(touched, trainee, what) {
  if (!touched.has(trainee)) throw new StoreError(`${trainee} has no Evidence in this Entry; ${what} goes with the Evidence about them`);
}

// Checks the Trainee-state changes an Entry carries against the cards; `cite` resolves a ref as
// for Assessments. Each is about a Trainee the Entry has Evidence about (`touched`), one per
// type per Trainee. Returns each as the record to store (without entry, at, retracted).
function checkChanges(docs, changes, cite, touched) {
  const seen = new Set();
  const cited = (tid, refs = []) => {
    if (!refs.length) throw new StoreError('a Trainee-state change rests on at least one Evidence');
    return refs.map((ref) => {
      const found = cite(ref, tid);
      if (!found) throw new StoreError(`"${ref}" is no Evidence of ${tid} (cite this Entry's Evidence as #<n>, or a stored Evidence id)`);
      return found;
    });
  };
  return changes.map(({ trainee, type, ...c }) => {
    checkTouched(touched, trainee, 'a Trainee-state change');
    const key = type === 'retired' ? `${trainee} retired ${c.item}` : `${trainee} ${type}`;
    if (seen.has(key)) throw new StoreError(`one ${type} change per Trainee per Entry`);
    seen.add(key);
    const card = docs.get(`trainees/${trainee}`).data;
    if (type === 'status') {
      const { to, reason, evidence, ...rest } = c;
      if (Object.keys(rest).length) throw new StoreError('a status change takes only trainee, to, reason and evidence');
      if (card.status?.by === 'commander') {
        throw new StoreError(`${card.name}'s Status was set by the Commander; propose the change instead ("(הצעה) …"), and only on a yes have the Commander change it (updateTrainee status)`);
      }
      const from = statusMove(card, to, reason);
      return { trainee, type, from, to, by: 'agent', reason: reason.trim(), evidence: cited(trainee, evidence).map((e) => e.id) };
    }
    if (type === 'retired') {
      const { item, by, reason, evidence, ...rest } = c;
      if (Object.keys(rest).length) throw new StoreError('retiring an item takes only trainee, item, by, reason and evidence');
      if (!ITEM_AUTHORS.includes(by)) throw new StoreError(`an item is retired by the agent or commander, got "${by}"`);
      const active = card.items.find((i) => i.id === item);
      if (!active) throw new StoreError(`${item} is not an active improve/keep item of ${card.name}`);
      if (by === 'agent' && active.by === 'commander') throw new StoreError(`${item} is the Commander's: it is retired only on the Commander's word`);
      if (typeof reason !== 'string' || !reason.trim()) throw new StoreError('retiring an item needs a reason');
      return { trainee, type, item, by, reason: reason.trim(), evidence: cited(trainee, evidence).map((e) => e.id) };
    }
    if (type === 'nextTalk') {
      const { questions, ...rest } = c;
      if (Object.keys(rest).length) throw new StoreError('next-Talk questions take only trainee and questions');
      return { trainee, type, questions: checkQuestions(questions), by: 'agent' };
    }
    if (type === 'snapshot') {
      const { text, ...rest } = c;
      if (Object.keys(rest).length) throw new StoreError('a Snapshot takes only trainee and text');
      if (typeof text !== 'string' || !text.trim()) throw new StoreError('a Snapshot needs its text');
      return { trainee, type, text: text.trim(), by: 'agent' };
    }
    // Only on the Commander's word, which is this Entry's evaluation-event Evidence.
    if (type === 'stage') {
      const { to, reason = null, evidence, ...rest } = c;
      if (Object.keys(rest).length) throw new StoreError('a stage change takes only trainee, to, reason and evidence');
      if (to !== null && !EVAL_STAGES.includes(to)) throw new StoreError(`an evaluation-process stage is one of ${EVAL_STAGES.join(', ')}, or null to leave the process; got "${to}"`);
      const from = card.evalStage ?? null;
      if (to === from) throw new StoreError(to ? `${card.name} is already at ${to}` : `${card.name} is not in the evaluation process`);
      const refs = cited(trainee, evidence);
      if (!refs.some((e) => e.local && e.kind === 'evaluation-event')) {
        throw new StoreError('a stage change cites the Commander\'s words: an evaluation-event Evidence of this Entry (#<n>)');
      }
      return { trainee, type, from, to, by: 'commander', reason: reason?.trim() || null, evidence: refs.map((e) => e.id) };
    }
    throw new StoreError(`a Trainee-state change is one of ${STATE_TYPES.join(', ')}, got "${type}"`);
  });
}

// The next-Talk questions (`nextTalk`): two or three, each its own, trimmed.
function checkQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 2 || questions.length > 3) {
    throw new StoreError(`next-Talk questions are two or three, got ${Array.isArray(questions) ? questions.length : 'none'}`);
  }
  const out = questions.map((q) => (typeof q === 'string' ? q.trim() : ''));
  if (out.some((q) => !q)) throw new StoreError('a next-Talk question is empty');
  if (new Set(out).size !== out.length) throw new StoreError('a next-Talk question is given twice');
  return out;
}

// Whether a text repeats a sensitive record already stored for the Trainee: a run of three of
// its words that none of the Trainee's public Evidence has (`shown`: public excerpts about to be
// written with it count too).
function repeatsStoredSensitive(docs, tid, shown = []) {
  const live = (xs) => xs.filter((x) => x.retracted === false);
  const excerpts = live(sensitiveOf(docs, tid)).filter((x) => x.record === 'evidence').map((x) => x.excerpt);
  const publicText = [...live(flat(docs.list(`trainees/${tid}/evidence`))).map((e) => e.excerpt), ...shown].join('\n');
  return repeatsSensitive(publicText, excerpts, []);
}

// Every text the store writes for display (on the card, or in a record the dashboard reads:
// reasons, Snapshots, the agent's items, Talk topics, next-Talk questions) is display-safe:
// refused when it repeats a sensitive record of that Trainee, stored or (`also`) one of the
// sensitive parts of the Entry it comes with. Paraphrase is the writer's to avoid.
function checkDisplaySafe(texts, repeats) {
  for (const t of texts) {
    if (t && repeats(t)) throw new StoreError(`"${t}" repeats a sensitive part; write it display-safe ("מצב אישי" at most) and cite the sensitive part by id`);
  }
}
const leaksFor = (docs, tid, { also = () => false, shown = [] } = {}) => {
  const stored = repeatsStoredSensitive(docs, tid, shown);
  return (t) => also(t) || stored(t);
};

// The texts the card shows that `leaks` catches, as [{what, text}] (what: snapshot, nextTalk,
// status, left, item): after an Evidence is marked sensitive, what still repeats it.
function cardRepeats(card, leaks) {
  const texts = [
    ['snapshot', card.snapshot?.text],
    ...(card.nextTalk?.questions ?? []).map((q) => ['nextTalk', q]),
    ['status', card.status?.reason],
    ['left', card.left?.reason],
    ...card.items.filter((i) => i.by === 'agent').map((i) => ['item', i.text]),
  ];
  return texts.filter(([, t]) => t && leaks(t)).map(([what, text]) => ({ what, text }));
}

// Checks a Status move on this card; returns the Status it moves from.
function statusMove(card, to, reason) {
  if (!STATUSES.includes(to)) throw new StoreError(`a Status is one of ${STATUSES.join(', ')}, got "${to}"`);
  if (typeof reason !== 'string' || !reason.trim()) throw new StoreError('a Status change needs a reason');
  const from = card.status?.value ?? null;
  if (to === from) throw new StoreError(`${card.name} is already ${to}`);
  return from;
}

// Whether a text repeats one of the Entry's sensitive excerpts: any run of three of its words (or
// the whole excerpt, if shorter), punctuation aside, that the Entry has nowhere outside a
// sensitive part.
function repeatsSensitive(text, excerpts, spans) {
  const words = (t) => t.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const padded = (t) => ` ${words(t).join(' ')} `;
  // The stretches of the Entry outside every sensitive part, each on its own.
  const outside = [];
  let from = 0;
  for (const [start, end] of [...spans].sort((x, y) => x[0] - y[0])) {
    outside.push(padded(text.slice(from, Math.max(from, start))));
    from = Math.max(from, end);
  }
  outside.push(padded(text.slice(from)));
  const runs = excerpts.flatMap((e) => {
    const w = words(e);
    if (w.length <= 3) return [` ${w.join(' ')} `];
    return w.slice(0, -2).map((_, i) => ` ${w.slice(i, i + 3).join(' ')} `);
  }).filter((r) => r.trim() && !outside.some((o) => o.includes(r)));
  return (t) => runs.some((r) => padded(t).includes(r));
}

// Every [start, end) at which `part` stands in `text`.
function spansOf(text, part) {
  const spans = [];
  if (!part) return spans;
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) spans.push([at, at + part.length]);
  return spans;
}

const overlaps = ([a, b], [c, d]) => a < d && c < b;

// A Follow-up is open until a non-retracted Evidence closes it.
function stillOpen(followups, evidence) {
  const closed = new Set(evidence.filter((e) => e.retracted === false).flatMap((e) => e.closes ?? []));
  return followups.filter((f) => f.retracted === false && !closed.has(f.id));
}

// The card is derived from the Trainee's records alone. It is display-safe: a sensitive Follow-up or
// improve/keep item shows as MARK.
function deriveCard({ changes, evidence, followups = [], items = [], assessments = [], sensitive = [] }, prev = {}) {
  const live = (xs) => xs.filter((x) => x.retracted === false);
  const named = live(changes).filter((c) => c.name).sort(byAt).at(-1);
  const leaving = live(changes).filter((c) => c.type === 'left' || c.type === 'rejoined').sort(byAt).at(-1);
  const left = leaving?.type === 'left' ? { date: leaving.date, how: leaving.how, reason: leaving.reason } : null;
  const latest = (type) => live(changes).filter((c) => c.type === type).sort(byWritten).at(-1);
  const status = latest('status');
  const retired = new Set(live(changes).filter((c) => c.type === 'retired').map((c) => c.item));
  const maskedItems = sensitive.filter((s) => s.record === 'item').map((i) => ({ ...i, text: MARK }));
  const snapshot = latest('snapshot');
  const nextTalk = latest('nextTalk');
  const masked = sensitive.filter((s) => s.record === 'followup').map((f) => ({ ...f, text: MARK }));
  const allEvidence = [...evidence, ...sensitive.filter((s) => s.record === 'evidence')];
  // The date of a Talk is not sensitive, even when the whole Talk is.
  const talks = live(allEvidence).filter((e) => e.kind === 'talk').map((e) => e.date).sort();
  return {
    name: named?.name ?? prev?.name ?? null,
    active: !left,
    left,
    status: status ? { value: status.to, by: status.by, reason: status.reason, at: status.at } : null,
    evalStage: latest('stage')?.to ?? null,
    lastTalk: talks.at(-1) ?? null,
    snapshot: snapshot ? { text: snapshot.text, at: snapshot.at } : null,
    items: live([...items, ...maskedItems]).filter((i) => !retired.has(i.id))
      .sort(byDayThenId)
      .map(({ id, kind, text, by, date }) => ({ id, kind, text, by, date })),
    followups: stillOpen([...followups, ...masked], allEvidence)
      .sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1))
      .map(({ id, text, date }) => ({ id, text, date })),
    nextTalk: nextTalk ? { questions: nextTalk.questions, at: nextTalk.at } : null,
    skills: skillsOf(assessments, allEvidence),
  };
}

// Per Skill, the Assessments that count toward its Rating as [date, score, author], oldest first,
// and `n`, how many live Evidence those counting Assessments cite. A Trainee's own never
// count; once the Commander has assessed a Skill, the agent's later ones are kept but don't either.
function skillsOf(assessments, evidence) {
  const live = new Set(evidence.filter((e) => e.retracted === false).map((e) => e.id));
  const bySkill = {};
  for (const a of assessments.filter((x) => x.retracted === false && x.author !== 'trainee').sort(byDate)) {
    (bySkill[a.skill] ??= []).push(a);
  }
  return Object.fromEntries(Object.keys(bySkill).sort().map((skill) => {
    const list = bySkill[skill];
    const first = list.findIndex((a) => a.author === 'commander');
    const counting = first === -1 ? list : list.filter((a, i) => i < first || a.author === 'commander');
    const cited = new Set(counting.flatMap((a) => a.evidence).filter((eid) => live.has(eid)));
    return [skill, { a: counting.map((a) => [a.date, a.score, a.author]), n: cited.size }];
  }));
}

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
// By when it was written, then id (`…-10` after `…-9`).
const byWritten = (a, b) => byAt(a, b) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
// By the day it happened, then when it was written, then id (`…-10` after `…-9`).
const byDay = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const byDayThenId = (a, b) => byDay(a, b) || a.id.localeCompare(b.id, 'en', { numeric: true });
const byDate = (a, b) => byDay(a, b) || byAt(a, b)
  || a.id.localeCompare(b.id, 'en', { numeric: true });

const flat = (docs) => docs.map((d) => ({ id: d.id, ...d.data }));
const sensitiveOf = (docs, tid) => flat(docs.query('sensitive', [['trainee', '==', tid]]));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Another session got there first; re-read and try again (or accept its work).
const lostRace = (e) => e instanceof VersionConflict || e instanceof AlreadyExists;

// Replaces one existing document with `next(current data)`, pinned to the version read; on a
// conflict reads again and redoes it. Returns the stored data.
function pinned(docs, docPath, next, missing = `${docPath} does not exist`) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = docs.get(docPath);
    if (!current) throw new StoreError(missing);
    const data = next(current.data);
    try {
      docs.batch([{ op: 'set', path: docPath, data, ifVersion: current.version }]);
      return data;
    } catch (e) {
      if (!(e instanceof VersionConflict)) throw e;
    }
  }
  throw new StoreError(`${docPath} kept changing; try again`);
}

function upsert(docs, docPath, data, current = docs.get(docPath)) {
  docs.batch([current
    ? { op: 'set', path: docPath, data, ifVersion: current.version }
    : { op: 'create', path: docPath, data }]);
}

// The directory of a local store by its address; null for an address of another backend.
const localRoot = (url) => (url?.startsWith(LOCAL) ? url.slice(LOCAL.length) : null);

function rootOf(url) {
  const root = localRoot(url);
  if (!root) throw new StoreError(`unsupported backend for ${url}`);
  return root;
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function randomChars(n) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
}

const pad = (n) => String(n).padStart(2, '0');

function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// `<prefix>-YYYYMMDD-HHMM`, local time: the stem of Entry and standalone Assessment ids.
const stampOf = (prefix, d) => `${prefix}-${localDate(d).replaceAll('-', '')}-${pad(d.getHours())}${pad(d.getMinutes())}`;

function isoWithOffset(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
