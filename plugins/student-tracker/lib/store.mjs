// Local JSON test backend for the storage interface (skills/tracker/references/storage.md).
// Built on the document layer (docs.mjs), which keeps the artifact database's write rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDocs, StoreError, VersionConflict, AlreadyExists, MAX_BATCH_WRITES, MAX_BATCH_BYTES } from './docs.mjs';

export { StoreError, VersionConflict };

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINTER = 'cycles.json';
const LOCAL = 'local:';
const NOT_SET_UP = 'עוד לא הוקם מעקב — הרץ `/student-tracker:setup`';
const DEFAULT_TALK = { target: 10, yellow: 10, red: 14 };
const MAX_RETRIES = 10;
// Evidence kinds and the kind-specific fields each may carry, with the value stored when absent.
const TEST_FIELDS = { subject: null, test: null, unlisted: false };
const KIND_FIELDS = {
  talk: { topics: [] },
  test: { ...TEST_FIELDS, score: null, self: null },
  'code-review': TEST_FIELDS,
  'project-observation': { project: null },
  'self-assessment': {},
  'improve-keep': {},
  goal: {},
  background: {},
  'evaluation-event': {},
  note: {},
  clarification: { clarifies: null },
};
export const KINDS = Object.keys(KIND_FIELDS);
// What stands in a public text where a sensitive sentence was cut out.
export const MARK = '[פרט אישי — בתיק]';
export const SENSITIVE_CATEGORIES = ['health', 'family', 'distress', 'finances', 'romance', 'discipline'];
// The Commander may mark anything sensitive; what fits no category is `other`.
const FLIP_CATEGORIES = [...SENSITIVE_CATEGORIES, 'other'];
// A sensitive piece is one of the kinds with no fields of their own.
const SENSITIVE_KINDS = KINDS.filter((k) => !Object.keys(KIND_FIELDS[k]).length);

// dataDir holds the pointer cycles.json = {current, archived}; `current` names the store.
// `interrupt(point, info)` is called at each step boundary of a multi-step write; tests use it
// to simulate a crash (throw) or a racing writer. Points: 'seeded', 'chunk', 'chunk-written',
// 'withdraw', 'withdrawn' (a Retraction or hard delete chunk).
export function openStore({ dataDir, now = () => new Date(), rand = randomChars, interrupt = () => {} } = {}) {
  if (!dataDir) throw new StoreError('missing plugin data dir');
  const pointerPath = path.join(dataDir, POINTER);
  const readPointer = () => ({ current: null, archived: [], ...readJson(pointerPath) });

  function storeRoot() {
    const { current } = readPointer();
    if (!current) throw new StoreError(NOT_SET_UP);
    if (!current.startsWith(LOCAL)) throw new StoreError(`unsupported backend for ${current}`);
    return current.slice(LOCAL.length);
  }
  const open = () => openDocs(storeRoot());
  const today = () => localDate(now());

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
      changes: sub('changes'), evidence: sub('evidence'), followups: sub('followups'), assessments: sub('assessments'), sensitive,
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
    const missing = records.filter((r) => !docs.get(r.path));
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

  // The Entry by id, or the last one written; finished first if an earlier session left it half-written.
  function entryToWithdraw(docs, eid) {
    const all = docs.list('entries').filter((e) => !e.data.deletion);
    const entry = eid ? all.find((e) => e.id === eid) : all.sort((a, b) => byAt(a.data, b.data) || a.id.localeCompare(b.id)).at(-1);
    if (!entry) throw new StoreError(eid ? `no Entry ${eid}` : 'nothing has been recorded yet');
    // A chunk written after the Retraction would bring its records back unflagged.
    if (entry.data.status === 'writing') finishEntry(docs, entry.id);
    return entry.id;
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
      const r = storeRoot();
      const cycle = openDocs(r).get('meta/cycle')?.data;
      if (!cycle) throw new StoreError(NOT_SET_UP);
      return { backend: 'local', url: `${LOCAL}${r}`, cycle: cycle.name, setup: cycle.setup };
    },

    // Setup only. Resumes a Cycle whose seed was interrupted; refuses one that is already done.
    createCycle({ commander, cycle, trainees = [] }) {
      if (!commander?.name) throw new StoreError('commander.name is required');
      if (!cycle?.name) throw new StoreError('cycle.name is required');
      const names = trainees.map((t) => (typeof t === 'string' ? t : t.name));
      const dup = names.find((n, i) => names.indexOf(n) !== i);
      if (dup) throw new StoreError(`duplicate Trainee name "${dup}" — ask for a distinguishing label`);

      const pointer = readPointer();
      const existing = pointer.current?.startsWith(LOCAL) ? pointer.current.slice(LOCAL.length) : null;
      const existingCycle = existing && openDocs(existing).get('meta/cycle')?.data;
      if (existingCycle?.setup === 'done') {
        throw new StoreError(`כבר קיים מעקב למחזור ${existingCycle.name}`);
      }
      const r = existing ?? path.join(dataDir, 'local', `c-${rand(6)}`);
      // Pointer first, so an interrupted seed is found and resumed instead of duplicated.
      writeJson(pointerPath, { ...pointer, current: `${LOCAL}${r}` });
      const docs = openDocs(r);

      const at = isoWithOffset(now());
      upsert(docs, 'meta/cycle', {
        name: cycle.name,
        start: cycle.start ?? today(),
        setup: 'in-progress',
        schema: 1,
        archived: false,
        at,
      });
      upsert(docs, 'meta/skills', readJson(path.join(PLUGIN_ROOT, 'data/skills.json')));
      if (!docs.get('meta/preset')) {
        docs.batch([{ op: 'create', path: 'meta/preset', data: readJson(path.join(PLUGIN_ROOT, 'data/preset.json')) }]);
      }
      upsert(docs, 'commander/settings', {
        name: commander.name,
        role: commander.role ?? null,
        talk: { ...DEFAULT_TALK, ...commander.talk },
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
      const done = docs.get('meta/cycle');
      docs.batch([{ op: 'update', path: 'meta/cycle', data: { setup: 'done' }, ifVersion: done.version }]);
      return { url: `${LOCAL}${r}`, trainees: all };
    },

    readCycle() {
      const docs = open();
      return {
        cycle: docs.get('meta/cycle')?.data,
        skills: docs.get('meta/skills')?.data,
        preset: docs.get('meta/preset')?.data ?? null,
        commander: {
          settings: docs.get('commander/settings')?.data,
          hides: docs.get('commander/hides')?.data ?? { hidden: [] },
        },
        playbook: flat(docs.list('playbook')),
      };
    },

    readTeam() {
      return flat(open().list('trainees'));
    },

    // Retracted records and Entries are left out unless `retracted` asks for them too.
    readTrainee(tid, { since, retracted = false } = {}) {
      const docs = open();
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

    // Entry written as `writing` with its whole plan → one chunk per Trainee → `done`.
    // Child ids are deterministic, so finishing it again never duplicates a record.
    recordEntry({ text, evidence = [], assessments = [] }) {
      const docs = open();
      if (!text) throw new StoreError('Entry text is required');
      if (!evidence.length) throw new StoreError('an Entry needs at least one Evidence');
      const preset = docs.get('meta/preset')?.data;
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
        if (!KINDS.includes(ev.kind)) throw new StoreError(`unknown kind "${ev.kind}" (one of ${KINDS.join(', ')})`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? '')) throw new StoreError(`date must be YYYY-MM-DD, got "${ev.date}"`);
        if (!wordForWord(text, ev.excerpt)) {
          throw new StoreError(`excerpt must be copied word-for-word from the Entry: "${ev.excerpt}"`);
        }
        const fields = kindFields(ev, preset);
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
      do id = `${stamp}-${rand(2)}`; while (docs.get(`entries/${id}`));

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
      // Assessments come last; `#<n>` cites this Entry's record `<entryId>-<n>`.
      const ours = [...children, ...parts];
      const judged = checkAssessments(docs, assessments, (ref, tid) => {
        const local = /^#\d+$/.test(ref) && ours.find((c) => c.id === `${id}-${ref.slice(1)}`);
        if (local) return local.trainee === tid ? { id: local.id, date: local.data.date, kind: local.data.kind } : null;
        return /^#/.test(ref) ? null : evidenceOf(docs, tid, ref);
      }).map((a) => {
        const childId = nextId();
        return {
          id: childId,
          path: `trainees/${a.trainee}/assessments/${childId}`,
          trainee: a.trainee,
          data: { entry: id, ...a, at, retracted: false },
        };
      });
      const all = [...children, ...parts, ...opened, ...judged];
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
      };
    },

    // Assessments of one Trainee outside an Entry (a re-rate, an accepted proposal), dated today,
    // in one version-pinned batch with the card.
    recordAssessments(tid, assessments = []) {
      const docs = open();
      if (!assessments.length) throw new StoreError('give at least one Assessment');
      const checked = checkAssessments(docs, assessments.map((a) => ({ ...a, trainee: tid })), (ref) => evidenceOf(docs, tid, ref));
      const d = now();
      const at = isoWithOffset(d);
      const stamp = stampOf('a', d);
      const taken = new Set();
      const records = checked.map((a) => {
        let id;
        do id = `${stamp}-${rand(2)}`; while (taken.has(id) || docs.get(`trainees/${tid}/assessments/${id}`));
        taken.add(id);
        return { path: `trainees/${tid}/assessments/${id}`, data: { entry: null, ...a, date: today(), at, retracted: false } };
      });
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const card = docs.get(`trainees/${tid}`);
        try {
          docs.batch([
            ...records.map((r) => ({ op: 'create', path: r.path, data: r.data })),
            { op: 'set', path: `trainees/${tid}`, data: derive(docs, tid, records), ifVersion: card.version },
          ]);
          return { assessments: records.map((r) => r.path.split('/').at(-1)) };
        } catch (e) {
          if (!(e instanceof VersionConflict)) throw e;
        }
      }
      throw new StoreError(`card ${tid} kept changing; try again`);
    },

    // Only after the Commander confirms. This version handles one change: adding a Test.
    updateCycle({ addTest, ...rest } = {}) {
      if (!addTest || Object.keys(rest).length) throw new StoreError('updateCycle supports only addTest in this version');
      const docs = open();
      const current = docs.get('meta/preset');
      if (!current) throw new StoreError('this Cycle has no preset copy');
      const preset = current.data;
      const { name, subject, number = null, aliases = [] } = addTest;
      if (!name) throw new StoreError('addTest needs a name');
      if (!preset.subjects.some((s) => s.id === subject)) {
        throw new StoreError(`unknown Subject "${subject}" (one of ${preset.subjects.map((s) => s.id).join(', ')})`);
      }
      for (const n of [name, ...aliases]) {
        const taken = findTest(preset, n);
        if (taken) throw new StoreError(`"${n}" is already the Test "${taken.name}"`);
      }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `t-${rand(4)}`;
      let id = `${subject}.${slug}`;
      while (preset.tests.some((t) => t.id === id)) id = `${subject}.${slug}-${rand(2)}`;
      const tests = [...preset.tests, { id, subject, number, name, aliases }];
      docs.batch([{ op: 'update', path: 'meta/preset', data: { tests }, ifVersion: current.version }]);
      return { ...preset, tests };
    },

    // Moves one Evidence, with the Follow-ups it opened, between the sensitive collection and the
    // Trainee's records: same ids, one version-pinned batch with the rebuilt card. Moving in needs
    // a category.
    flipSensitive(evidenceId, { category } = {}) {
      const docs = open();
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const sensitiveDoc = docs.get(`sensitive/${evidenceId}`);
        const tids = docs.list('trainees').map((t) => t.id);
        if (sensitiveDoc?.data.record === 'followup' || tids.some((t) => docs.get(`trainees/${t}/followups/${evidenceId}`))) {
          throw new StoreError(`${evidenceId} is a Follow-up; flip the Evidence it was opened from`);
        }
        const tid = sensitiveDoc?.data.trainee ?? tids.find((t) => docs.get(`trainees/${t}/evidence/${evidenceId}`));
        if (!tid) throw new StoreError(`no Evidence ${evidenceId}`);
        // An Entry still being written would recreate the record at its old place: finish it first.
        const { entry } = (sensitiveDoc ?? docs.get(`trainees/${tid}/evidence/${evidenceId}`)).data;
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
        const followups = toPublic
          ? docs.list('sensitive').filter((d) => d.data.record === 'followup' && d.data.from === evidenceId)
          : docs.list(`trainees/${tid}/followups`).filter((d) => d.data.from === evidenceId);
        const from = (rid, kind) => (toPublic ? `sensitive/${rid}` : `trainees/${tid}/${kind}/${rid}`);
        const to = (rid, kind) => (toPublic ? `trainees/${tid}/${kind}/${rid}` : `sensitive/${rid}`);
        const moves = [
          { id: evidenceId, kind: 'evidence', doc: evidence },
          ...followups.map((d) => ({ id: d.id, kind: 'followups', doc: d })),
        ].map(({ id: rid, kind, doc }) => {
          const { record, category: c, ...data } = doc.data;
          const moved = toPublic ? data : { record: kind === 'evidence' ? 'evidence' : 'followup', ...data, ...(kind === 'evidence' ? { category } : {}) };
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
          return { id: evidenceId, now: toPublic ? 'public' : 'sensitive', moved: moves.map((m) => m.to.split('/').at(-1)) };
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
      const docs = open();
      const stuck = (key) => docs.list('entries').filter((e) => e.data[key] === 'writing').map((e) => e.id);
      const writing = stuck('status');
      for (const id of writing) finishEntry(docs, id);
      const retracting = stuck('retraction');
      for (const id of retracting) finishWithdrawal(docs, id, RETRACT);
      const deleting = stuck('deletion');
      for (const id of deleting) finishWithdrawal(docs, id, DELETE);
      return { finished: [...new Set([...writing, ...retracting, ...deleting])] };
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
function kindFields(ev, preset) {
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
  if ('project' in allowed && out.project && !preset?.projects.some((p) => p.id === out.project)) {
    throw new StoreError(`unknown project "${out.project}" (one of ${preset?.projects.map((p) => p.id).join(', ')})`);
  }
  return out;
}

// The preset Test known by this name or alias (ignoring case and spacing), if any.
function findTest(preset, name) {
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return (preset?.tests ?? []).find((t) => [t.name, ...t.aliases].some((a) => norm(a) === norm(name)));
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
  const s = docs.get(`sensitive/${id}`)?.data;
  const found = pub ?? (s?.record === 'evidence' && s.trainee === tid ? s : null);
  return found?.retracted === false ? { id, date: found.date, kind: found.kind } : null;
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

// Subcollections that hold records cut from an Entry.
const CHILD_KINDS = ['evidence', 'followups', 'assessments', 'items'];

// Where each of `ids` that belongs to this Trainee is now, as {path, version, data}: in their
// subcollections, or in `sensitive/` wherever a flip has moved it.
function childrenOf(docs, tid, ids) {
  return ids.flatMap((cid) => {
    for (const p of [...CHILD_KINDS.map((k) => `trainees/${tid}/${k}/${cid}`), `sensitive/${cid}`]) {
      const doc = docs.get(p);
      if (doc?.data.trainee === tid) return [{ path: p, ...doc }];
    }
    return [];
  });
}

const AUTHORS = ['agent', 'commander', 'trainee'];

// Checks Assessments against the Skill framework; `cite(ref, tid)` resolves a cited ref to that
// Trainee's Evidence {id, date, kind}, or null. Returns each with its Evidence ids, dated by the latest.
function checkAssessments(docs, assessments, cite) {
  const skills = new Set((docs.get('meta/skills')?.data.groups ?? []).flatMap((g) => g.skills.filter((k) => !k.archived).map((k) => k.id)));
  const seen = new Set();
  return assessments.map((a) => {
    const { trainee, skill, score, author, reason, evidence = [], ...rest } = a;
    if (Object.keys(rest).length) throw new StoreError(`an Assessment takes only trainee, skill, score, author, reason and evidence`);
    if (!docs.get(`trainees/${trainee}`)) throw new StoreError(`unknown Trainee ${trainee}`);
    if (!skills.has(skill)) throw new StoreError(`unknown Skill "${skill}"; use a Skill id from meta/skills`);
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

// The card is derived from the Trainee's records alone. Agent-written caches (Snapshot,
// next-Talk questions) are not derivable, so they carry over from the previous card. It is
// display-safe: a sensitive Follow-up shows as MARK.
function deriveCard({ changes, evidence, followups = [], assessments = [], sensitive = [] }, prev = {}) {
  const live = (xs) => xs.filter((x) => x.retracted === false);
  const named = live(changes).filter((c) => c.name).sort(byAt).at(-1);
  const masked = sensitive.filter((s) => s.record === 'followup').map((f) => ({ ...f, text: MARK }));
  const allEvidence = [...evidence, ...sensitive.filter((s) => s.record === 'evidence')];
  // The date of a Talk is not sensitive, even when the whole Talk is.
  const talks = live(allEvidence).filter((e) => e.kind === 'talk').map((e) => e.date).sort();
  return {
    name: named?.name ?? prev?.name ?? null,
    active: true,
    left: null,
    status: null,
    evalStage: null,
    lastTalk: talks.at(-1) ?? null,
    snapshot: prev?.snapshot ?? null,
    items: [],
    followups: stillOpen([...followups, ...masked], allEvidence)
      .sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1))
      .map(({ id, text, date }) => ({ id, text, date })),
    nextTalk: prev?.nextTalk ?? null,
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
// By the day it happened, then when it was written, then id (`…-10` after `…-9`).
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || byAt(a, b)
  || a.id.localeCompare(b.id, 'en', { numeric: true });

const flat = (docs) => docs.map((d) => ({ id: d.id, ...d.data }));
const sensitiveOf = (docs, tid) => flat(docs.list('sensitive')).filter((s) => s.trainee === tid);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Another session got there first; re-read and try again (or accept its work).
const lostRace = (e) => e instanceof VersionConflict || e instanceof AlreadyExists;

function upsert(docs, docPath, data, current = docs.get(docPath)) {
  docs.batch([current
    ? { op: 'set', path: docPath, data, ifVersion: current.version }
    : { op: 'create', path: docPath, data }]);
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
