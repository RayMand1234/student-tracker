// The snapshot → plan → apply seam (lean-turns spec, Testing Decisions). A fixture state is built
// on the local backend; the same operation then runs (a) directly on it and (b) through a snapshot
// of it in `out_dir` layout, the plan step, and a test-side apply under the local docs layer's
// database rules. Both runs get the same fixed clock and random source.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../../lib/store.mjs';
import { openDocs } from '../../lib/docs.mjs';

export const NOW = new Date('2026-10-30T09:15:00');

// A random source that gives the same characters on every run that starts from the same seed.
export function seededRand(seed = 1) {
  let s = seed;
  return (n) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      out += 'abcdefghijklmnopqrstuvwxyz0123456789'[s % 36];
    }
    return out;
  };
}

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// A set-up Cycle with the given Trainees on the local backend: {dataDir, root, id: name → tid}.
export function fixture(trainees = ['נועה', 'דני']) {
  const dataDir = tmp('st-seam-');
  const store = openStore({ dataDir, now: () => NOW, rand: seededRand(7) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { dataDir, root: storeRoot(dataDir), id, store };
}

export function storeRoot(dataDir) {
  const { current } = JSON.parse(fs.readFileSync(path.join(dataDir, 'cycles.json'), 'utf8'));
  return current.replace(/^local:/, '');
}

// Every document of a local store: {<doc path>: data}. Versions are left out on purpose: the
// local backend writes an Entry in steps (each bumping versions) where a plan sends one batch.
export function contents(root) {
  const out = {};
  for (const f of fs.readdirSync(root, { recursive: true })) {
    if (!f.endsWith('.json')) continue;
    out[f.slice(0, -5).split(path.sep).join('/')] = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')).data;
  }
  return out;
}

// A copy of a local store's data dir, so (a) and (b) start from the same state.
export function copyDataDir(dataDir) {
  const to = tmp('st-seam-copy-');
  fs.cpSync(dataDir, to, { recursive: true });
  const root = storeRoot(dataDir);
  const copiedRoot = path.join(to, path.relative(dataDir, root));
  const pointer = path.join(to, 'cycles.json');
  fs.writeFileSync(pointer, JSON.stringify({ ...JSON.parse(fs.readFileSync(pointer, 'utf8')), current: `local:${copiedRoot}` }));
  return to;
}

// What `ArtifactData` reads with `out_dir` save from a local store, as a fake of the database:
// each found document's data at <collection path>/<doc id>.json, and the reads list the model
// writes: every read made, as the one-line JSON the manifest printed, then "<doc path> <version>"
// for each document it found. A list or query returns at most its `limit` (default 100) from its
// `cursor`, and a `next_cursor` line when more are left.
export function fetchReads(root, reads, dir = tmp('st-seam-snap-')) {
  const docs = openDocs(root);
  const lines = [];
  const matches = (data, where = []) => where.every(([field, op, value]) => {
    if (op !== '==') throw new Error(`the fake database knows only ==, got ${op}`);
    return data[field] === value;
  });
  for (const { out_dir: _, ...read } of reads) {
    lines.push(JSON.stringify(read));
    // A page starts at its cursor (here, an offset) and gives the next one when more are left.
    const from = Number(read.query?.cursor ?? 0);
    const limit = read.query?.limit ?? 100;
    const all = read.action === 'get'
      ? [docs.get(`${read.collection}/${read.doc_id}`)].filter(Boolean).map((d) => ({ id: read.doc_id, ...d }))
      : docs.list(read.collection).filter((d) => read.action === 'list' || matches(d.data, read.query?.where));
    const found = read.action === 'get' ? all : all.slice(from, from + limit);
    for (const doc of found) {
      const file = path.join(dir, read.collection, `${doc.id}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(doc.data, null, 2));
      lines.push(`${read.collection}/${doc.id} ${doc.version}`);
    }
    if (read.action !== 'get' && all.length > from + limit) lines.push(`next_cursor: "${from + limit}"`);
  }
  const versions = path.join(tmp('st-seam-versions-'), 'versions.txt');
  fs.writeFileSync(versions, `${lines.join('\n')}\n`);
  return { dir, versions };
}

// Sends a plan's batches, in order, to a local docs store, as `ArtifactData` `batch` would: a
// `set` with no `if_version` creates. Stops at the first refused batch and throws its error.
export function applyPlan(root, batches) {
  const docs = openDocs(root);
  for (const writes of batches) {
    docs.batch(writes.map((w) => ({
      op: w.op === 'set' && w.if_version === undefined ? 'create' : w.op,
      path: `${w.collection}/${w.doc_id}`,
      ...(w.file_path ? { data: JSON.parse(fs.readFileSync(w.file_path, 'utf8')) } : {}),
      ...(w.if_version !== undefined ? { ifVersion: w.if_version } : {}),
    })));
  }
}

export const planDir = () => tmp('st-seam-plan-');

// Whether a "missing reads" refusal names `read`, whatever snapshot folder (out_dir) it gives it.
export function namesRead(message, read) {
  const want = JSON.stringify(read);
  return (message ?? '').split('\n').some((line) => {
    if (!line.startsWith('{')) return false;
    const { out_dir: _, ...named } = JSON.parse(line);
    return JSON.stringify(named) === want;
  });
}
