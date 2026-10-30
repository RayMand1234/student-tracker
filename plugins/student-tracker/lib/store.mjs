// Local JSON test backend for the storage interface (skills/tracker/references/storage.md).
// Mirrors the artifact database's collection layout: <root>/<collection>/<docId>.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POINTER = 'cycles.json';
const LOCAL = 'local:';
const NOT_SET_UP = 'עוד לא הוקם מעקב — הרץ `/student-tracker:setup`';
const DEFAULT_TALK = { target: 10, yellow: 10, red: 14 };
export const KINDS = [
  'talk', 'test', 'code-review', 'project-observation', 'self-assessment', 'improve-keep',
  'goal', 'background', 'evaluation-event', 'note', 'clarification',
];

export class StoreError extends Error {}

// dataDir holds the pointer cycles.json = {current, archived}; `current` names the store.
export function openStore({ dataDir, now = () => new Date(), rand = randomChars } = {}) {
  if (!dataDir) throw new StoreError('missing plugin data dir');
  const pointerPath = path.join(dataDir, POINTER);
  const readPointer = () => ({ current: null, archived: [], ...readJson(pointerPath) });

  function root() {
    const { current } = readPointer();
    if (!current) throw new StoreError(NOT_SET_UP);
    if (!current.startsWith(LOCAL)) throw new StoreError(`unsupported backend for ${current}`);
    return current.slice(LOCAL.length);
  }

  const doc = (r, docPath) => path.join(r, `${docPath}.json`);
  const get = (r, docPath) => readJson(doc(r, docPath));
  const put = (r, docPath, data) => writeJson(doc(r, docPath), data);
  const today = () => localDate(now());

  return {
    connect() {
      const r = root();
      const cycle = get(r, 'meta/cycle');
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
      const existingCycle = existing && get(existing, 'meta/cycle');
      if (existingCycle?.setup === 'done') {
        throw new StoreError(`כבר קיים מעקב למחזור ${existingCycle.name}`);
      }
      const r = existing ?? path.join(dataDir, 'local', `c-${rand(6)}`);
      // Pointer first, so an interrupted seed is found and resumed instead of duplicated.
      writeJson(pointerPath, { ...pointer, current: `${LOCAL}${r}` });

      const at = isoWithOffset(now());
      put(r, 'meta/cycle', {
        name: cycle.name,
        start: cycle.start ?? today(),
        setup: 'in-progress',
        schema: 1,
        archived: false,
        at,
      });
      put(r, 'meta/skills', readJson(path.join(PLUGIN_ROOT, 'data/skills.json')));
      put(r, 'commander/settings', {
        name: commander.name,
        role: commander.role ?? null,
        talk: { ...DEFAULT_TALK, ...commander.talk },
        at,
      });
      put(r, 'commander/hides', { hidden: [] });
      const seeded = listDocs(path.join(r, 'trainees'));
      const all = names.map((name) => {
        const found = seeded.find((t) => t.name === name);
        if (found) return { id: found.id, name };
        const id = `t-${rand(6)}`;
        put(r, `trainees/${id}`, newCard(name, at));
        return { id, name };
      });
      put(r, 'meta/cycle', { ...get(r, 'meta/cycle'), setup: 'done' });
      return { url: `${LOCAL}${r}`, trainees: all };
    },

    readCycle() {
      const r = root();
      return {
        cycle: get(r, 'meta/cycle'),
        skills: get(r, 'meta/skills'),
        preset: get(r, 'meta/preset'),
        commander: {
          settings: get(r, 'commander/settings'),
          hides: get(r, 'commander/hides') ?? { hidden: [] },
        },
        playbook: listDocs(path.join(r, 'playbook')),
      };
    },

    readTeam() {
      return listDocs(path.join(root(), 'trainees'));
    },

    readTrainee(tid, { since } = {}) {
      const r = root();
      const card = get(r, `trainees/${tid}`);
      if (!card) throw new StoreError(`unknown Trainee ${tid}`);
      const sub = (name) => listDocs(path.join(r, 'trainees', tid, name));
      const from = (d) => !since || d >= since;
      return {
        card: { id: tid, ...card },
        evidence: sub('evidence').filter((e) => from(e.date)),
        assessments: sub('assessments').filter((a) => from(a.date ?? a.at.slice(0, 10))),
        followups: sub('followups'),
        items: sub('items'),
        changes: sub('changes'),
        sensitive: listDocs(path.join(r, 'sensitive')).filter((s) => s.trainee === tid && from(s.date)),
        entries: listDocs(path.join(r, 'entries')).filter(
          (e) => e.trainees.includes(tid) && from(e.at.slice(0, 10)),
        ),
      };
    },

    // Minimal: Talk Evidence and the card's last Talk date. Chunking and resume are ticket 12.
    recordEntry({ text, evidence = [] }) {
      const r = root();
      if (!text) throw new StoreError('Entry text is required');
      if (!evidence.length) throw new StoreError('an Entry needs at least one Evidence');
      for (const ev of evidence) {
        if (!get(r, `trainees/${ev.trainee}`)) throw new StoreError(`unknown Trainee ${ev.trainee}`);
        if (!KINDS.includes(ev.kind)) throw new StoreError(`unknown kind "${ev.kind}" (one of ${KINDS.join(', ')})`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? '')) throw new StoreError(`date must be YYYY-MM-DD, got "${ev.date}"`);
        if (!ev.excerpt || !text.includes(ev.excerpt)) {
          throw new StoreError(`excerpt must be copied word-for-word from the Entry: "${ev.excerpt}"`);
        }
      }

      const d = now();
      const at = isoWithOffset(d);
      const stamp = `e-${localDate(d).replaceAll('-', '')}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      let id;
      do id = `${stamp}-${rand(2)}`; while (get(r, `entries/${id}`));
      const trainees = [...new Set(evidence.map((ev) => ev.trainee))];
      put(r, `entries/${id}`, { text, at, status: 'writing', trainees, retracted: false });

      const ids = evidence.map((ev, i) => {
        const childId = `${id}-${i + 1}`;
        const { trainee, kind, date, excerpt, ...fields } = ev;
        put(r, `trainees/${trainee}/evidence/${childId}`, {
          entry: id, trainee, kind, date, excerpt, ...fields, at, retracted: false,
        });
        return childId;
      });
      for (const tid of trainees) {
        const card = get(r, `trainees/${tid}`);
        const talks = evidence.filter((ev) => ev.trainee === tid && ev.kind === 'talk').map((ev) => ev.date);
        const lastTalk = [card.lastTalk, ...talks].filter(Boolean).sort().at(-1) ?? null;
        put(r, `trainees/${tid}`, { ...card, lastTalk, at });
      }

      put(r, `entries/${id}`, { ...get(r, `entries/${id}`), status: 'done' });
      return { entry: id, evidence: ids };
    },
  };
}

function newCard(name, at) {
  return {
    name,
    active: true,
    left: null,
    status: null,
    evalStage: null,
    lastTalk: null,
    snapshot: null,
    items: [],
    followups: [],
    nextTalk: null,
    skills: {},
    at,
  };
}

function listDocs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ id: f.slice(0, -5), ...readJson(path.join(dir, f)) }));
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
