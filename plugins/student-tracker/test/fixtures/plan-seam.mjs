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

// What a full set of `out_dir` reads of a local store saves: data-only files at
// <collection path>/<doc id>.json, plus the versions list the model copies from the read results.
export function snapshotOf(root) {
  const dir = tmp('st-seam-snap-');
  const versions = [];
  for (const f of fs.readdirSync(root, { recursive: true })) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(doc.data, null, 2));
    versions.push(`${f.slice(0, -5).split(path.sep).join('/')} ${doc.version}`);
  }
  const versionsFile = path.join(tmp('st-seam-versions-'), 'versions.txt');
  fs.writeFileSync(versionsFile, `${versions.join('\n')}\n`);
  return { dir, versions: versionsFile };
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
