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

// dataDir holds the pointer cycles.json = {current, archived}; `current` names the store.
// `interrupt(point, info)` is called at each step boundary of a multi-step write; tests use it
// to simulate a crash (throw) or a racing writer. Points: 'seeded', 'chunk', 'chunk-written'.
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

  // Read every source record of one Trainee and derive the card from them, plus `extra`
  // records ({path, data}) about to be written.
  function derive(docs, tid, extra = []) {
    const sub = (name) => [
      ...docs.list(`trainees/${tid}/${name}`).map((d) => ({ id: d.id, ...d.data })),
      ...extra.filter((r) => r.path.split('/')[2] === name).map((r) => ({ id: r.path.split('/')[3], ...r.data })),
    ];
    const prev = docs.get(`trainees/${tid}`)?.data;
    return deriveCard({ changes: sub('changes'), evidence: sub('evidence'), followups: sub('followups') }, prev);
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
      // still missing, then rebuild the card from sources.
      for (const c of creates) {
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
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const entry = docs.get(`entries/${id}`);
      if (entry.data.status === 'done') return; // another session finished it
      const { pending, ...rest } = entry.data;
      try {
        docs.batch([{ op: 'set', path: `entries/${id}`, data: { ...rest, status: 'done' }, ifVersion: entry.version }]);
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

    readTrainee(tid, { since } = {}) {
      const docs = open();
      const card = docs.get(`trainees/${tid}`);
      if (!card) throw new StoreError(`unknown Trainee ${tid}`);
      const sub = (name) => flat(docs.list(`trainees/${tid}/${name}`));
      const from = (d) => !since || d >= since;
      return {
        card: { id: tid, ...card.data },
        evidence: sub('evidence').filter((e) => from(e.date)),
        assessments: sub('assessments').filter((a) => from(a.date ?? a.at.slice(0, 10))),
        followups: sub('followups'),
        items: sub('items'),
        changes: sub('changes'),
        sensitive: flat(docs.list('sensitive')).filter((s) => s.trainee === tid && from(s.date)),
        entries: flat(docs.list('entries')).filter((e) => e.trainees.includes(tid) && from(e.at.slice(0, 10))),
      };
    },

    // Entry written as `writing` with its whole plan → one chunk per Trainee → `done`.
    // Child ids are deterministic, so finishing it again never duplicates a record.
    recordEntry({ text, evidence = [] }) {
      const docs = open();
      if (!text) throw new StoreError('Entry text is required');
      if (!evidence.length) throw new StoreError('an Entry needs at least one Evidence');
      const preset = docs.get('meta/preset')?.data;
      const fieldsOf = [];
      const closing = new Set();
      for (const { followups = [], ...ev } of evidence) {
        if (!docs.get(`trainees/${ev.trainee}`)) throw new StoreError(`unknown Trainee ${ev.trainee}`);
        if (!KINDS.includes(ev.kind)) throw new StoreError(`unknown kind "${ev.kind}" (one of ${KINDS.join(', ')})`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? '')) throw new StoreError(`date must be YYYY-MM-DD, got "${ev.date}"`);
        if (!ev.excerpt || !text.includes(ev.excerpt)) {
          throw new StoreError(`excerpt must be copied word-for-word from the Entry: "${ev.excerpt}"`);
        }
        const fields = kindFields(ev, preset);
        if (ev.kind === 'clarification' && !docs.get(`trainees/${ev.trainee}/evidence/${fields.clarifies}`)) {
          throw new StoreError(`a clarification needs clarifies = the id of the ${ev.trainee} Evidence it corrects`);
        }
        for (const f of followups) {
          if (!f || !text.includes(f)) throw new StoreError(`a Follow-up must be copied word-for-word from the Entry: "${f}"`);
        }
        // Checked against the card, as the artifact backend does; the card is kept in step with the sources.
        const openIds = docs.get(`trainees/${ev.trainee}`).data.followups.map((f) => f.id);
        for (const fid of fields.closes) {
          if (!openIds.includes(fid) || closing.has(fid)) throw new StoreError(`${fid} is not an open Follow-up of ${ev.trainee}`);
          closing.add(fid);
        }
        fieldsOf.push(fields);
      }

      const d = now();
      const at = isoWithOffset(d);
      const stamp = `e-${localDate(d).replaceAll('-', '')}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      let id;
      do id = `${stamp}-${rand(2)}`; while (docs.get(`entries/${id}`));

      // Evidence is numbered first, in message order, then the Follow-ups it opens.
      const children = evidence.map((ev, i) => {
        const { trainee, kind, date, excerpt } = ev;
        const childId = `${id}-${i + 1}`;
        return {
          id: childId,
          path: `trainees/${trainee}/evidence/${childId}`,
          trainee,
          data: { entry: id, trainee, kind, date, excerpt, ...fieldsOf[i], at, retracted: false },
        };
      });
      for (const [i, ev] of evidence.entries()) {
        for (const followup of ev.followups ?? []) {
          const childId = `${id}-${children.length + 1}`;
          children.push({
            id: childId,
            path: `trainees/${ev.trainee}/followups/${childId}`,
            trainee: ev.trainee,
            data: { entry: id, trainee: ev.trainee, text: followup, from: children[i].id, date: ev.date, at, retracted: false },
          });
        }
      }
      const trainees = [...new Set(children.map((c) => c.trainee))];
      const pending = trainees.map((trainee) => ({
        trainee,
        records: children.filter((c) => c.trainee === trainee).map(({ path: p, data }) => ({ path: p, data })),
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
        data: { text, at, status: 'writing', trainees, children: children.map((c) => c.id), retracted: false, pending },
      }]);
      finishEntry(docs, id);
      return {
        entry: id,
        evidence: children.slice(0, evidence.length).map((c) => c.id),
        followups: children.slice(evidence.length).map((c) => c.id),
      };
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

    // Finish every Entry an earlier session left at `writing`. Returns their ids.
    resumePending() {
      const docs = open();
      const stuck = docs.list('entries').filter((e) => e.data.status === 'writing').map((e) => e.id);
      for (const id of stuck) finishEntry(docs, id);
      return { finished: stuck };
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

// A Follow-up is open until a non-retracted Evidence closes it.
function stillOpen(followups, evidence) {
  const closed = new Set(evidence.filter((e) => e.retracted === false).flatMap((e) => e.closes ?? []));
  return followups.filter((f) => f.retracted === false && !closed.has(f.id));
}

// The card is derived from the Trainee's records alone. Agent-written caches (Snapshot,
// next-Talk questions) are not derivable, so they carry over from the previous card.
function deriveCard({ changes, evidence, followups = [] }, prev = {}) {
  const live = (xs) => xs.filter((x) => x.retracted === false);
  const named = live(changes).filter((c) => c.name).sort(byAt).at(-1);
  const talks = live(evidence).filter((e) => e.kind === 'talk').map((e) => e.date).sort();
  return {
    name: named?.name ?? prev?.name ?? null,
    active: true,
    left: null,
    status: null,
    evalStage: null,
    lastTalk: talks.at(-1) ?? null,
    snapshot: prev?.snapshot ?? null,
    items: [],
    followups: stillOpen(followups, evidence)
      .sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1))
      .map(({ id, text, date }) => ({ id, text, date })),
    nextTalk: prev?.nextTalk ?? null,
    skills: {},
  };
}

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

const flat = (docs) => docs.map((d) => ({ id: d.id, ...d.data }));
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

function isoWithOffset(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
