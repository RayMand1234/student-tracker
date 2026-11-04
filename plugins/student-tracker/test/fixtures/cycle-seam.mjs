// The snapshot → plan → apply seam (plan-seam.mjs) for the roster, settings, Playbook and Cycle
// lifecycle operations. Each runs (a) directly on a copy of a local fixture and (b) as the model
// runs it on the artifact backend: the manifest's reads fetched into a snapshot, the plan step,
// then the plan's batches sent. Both runs get the same fixed clock and random source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, StoreError } from '../../lib/store.mjs';
import { openDocs, MissingReads, readKey } from '../../lib/docs.mjs';
import { runOperation } from '../../lib/operations.mjs';
import { planOperation, readsFor } from '../../lib/plan.mjs';
import { NOW, seededRand, fixture, copyDataDir, storeRoot, contents, fetchReads, applyPlan, planDir } from './plan-seam.mjs';

const clock = { now: () => NOW };

// {result} or {refusal}: the operation's outcome.
export function outcome(fn) {
  try {
    return { result: fn() };
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return { refusal: e.message };
  }
}

// Runs `op` on the current Cycle both ways from the same state: {local, planned}, each {result}
// or {refusal}, plus both stores' contents afterwards.
export function bothWays(dataDir, op, { args = [], input = '', insist = false } = {}) {
  const localDir = copyDataDir(dataDir);
  const local = outcome(() => runOperation(openStore({ dataDir: localDir, ...clock, rand: seededRand(3) }), op, { args, input, insist }));

  const appliedDir = copyDataDir(dataDir);
  const snapshot = fetchReads(storeRoot(appliedDir), readsFor({ op, args, input }));
  const planned = outcome(() => {
    const plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, insist, ...clock, rand: seededRand(3) });
    applyPlan(storeRoot(appliedDir), plan.batches);
    return plan.result;
  });
  return { local, planned, localStore: contents(storeRoot(localDir)), plannedStore: contents(storeRoot(appliedDir)) };
}

// A copy of a whole data dir, every Cycle in it, with each address in it (the pointer, a
// Cycle's `previous`) moved to the copy.
export function cloneDataDir(dataDir) {
  const to = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-clone-'));
  fs.cpSync(dataDir, to, { recursive: true });
  const [from, into] = [JSON.stringify(dataDir).slice(1, -1), JSON.stringify(to).slice(1, -1)];
  for (const f of fs.readdirSync(to, { recursive: true }).filter((x) => x.endsWith('.json'))) {
    const file = path.join(to, f);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(from, into));
  }
  return to;
}

// `value` with the data dir's path written as <data>, so two copies compare equal.
const normal = (value, dataDir) => (value === undefined ? value
  : JSON.parse(JSON.stringify(value).replaceAll(JSON.stringify(dataDir).slice(1, -1), '<data>')));

const rootOf = (url) => url.replace(/^local:/, '');
const pointerFile = (dataDir) => path.join(dataDir, 'cycles.json');
export const readPointer = (dataDir) => (fs.existsSync(pointerFile(dataDir)) ? JSON.parse(fs.readFileSync(pointerFile(dataDir), 'utf8')) : {});

// Every Cycle store of a data dir with documents in it: {<store folder>: contents}.
function allStores(dataDir) {
  const dir = path.join(dataDir, 'local');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const d of fs.readdirSync(dir)) {
    const c = contents(path.join(dir, d));
    if (Object.keys(c).length) out[d] = normal(c, dataDir);
  }
  return out;
}

// What `ArtifactData` reads with `out_dir` save, each from the Cycle at its `url` (no `url`: the
// one at `main`): the read lines as the manifest printed them, then "<doc path> <version>" per
// document found, appended to `versions`.
function fetchInto(reads, main, versions, snapshot) {
  const lines = [];
  for (const given of reads) {
    const read = { out_dir: snapshot, ...given };
    lines.push(JSON.stringify(read));
    const docs = openDocs(rootOf(read.url ?? main));
    const found = read.action === 'get'
      ? [docs.get(`${read.collection}/${read.doc_id}`)].filter(Boolean).map((d) => ({ id: read.doc_id, ...d }))
      : docs.query(read.collection, read.action === 'query' ? read.query.where : []);
    for (const doc of found) {
      const file = path.join(read.out_dir, read.collection, `${doc.id}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(doc.data, null, 2));
      lines.push(`${read.collection}/${doc.id} ${doc.version}`);
    }
  }
  fs.appendFileSync(versions, `${lines.join('\n')}\n`);
}

// Runs `op` both ways from the same data dir, Cycles across: (a) directly on the local backend
// (`cycle`: the address of an archived Cycle it runs on), (b) as the model does on the artifact
// backend: `prepare(dataDir)` for what it did before (setup publishes the page and writes the
// pointer), the manifest's reads into a snapshot, the plan step with the pointer file, the
// missing reads it names fetched and the plan run again, the pointer the plan gives written,
// then the batches sent to the plan's `url` or the current Cycle. `skip`: random characters
// the local run spends that the planned one does not (a fresh store's folder name).
// Gives both outcomes, pointers and stores, with the data dir's path written as <data>.
export function twoWays(dataDir, op, { args = [], input = '', cycle, prepare = () => {}, skip = 0 } = {}) {
  const localDir = cloneDataDir(dataDir);
  const at = (url, dir) => url && url.replace(dataDir, dir);
  const local = outcome(() => runOperation(openStore({ dataDir: localDir, cycle: at(cycle, localDir), ...clock, rand: seededRand(3) }), op, { args: args.map((a) => at(a, localDir)), input: at(input, localDir) }));

  const plannedDir = cloneDataDir(dataDir);
  prepare(plannedDir);
  const [pArgs, pInput] = [args.map((a) => at(a, plannedDir)), at(input, plannedDir)];
  const main = at(cycle, plannedDir) ?? readPointer(plannedDir).current;
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-snap-'));
  const versions = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-versions-')), 'versions.txt');
  fs.writeFileSync(versions, '');
  fetchInto(readsFor({ op, args: pArgs, input: pInput, snapshot }), main, versions, snapshot);
  const planned = outcome(() => {
    for (let round = 0; ; round++) {
      const rand = seededRand(3);
      rand(skip);
      try {
        const plan = planOperation({ snapshot, versions, out: planDir(), op, args: pArgs, input: pInput, pointer: pointerFile(plannedDir), ...clock, rand });
        if (plan.pointer) fs.writeFileSync(pointerFile(plannedDir), JSON.stringify(plan.pointer));
        applyPlan(rootOf(plan.url ?? main), plan.batches);
        return plan.result;
      } catch (e) {
        if (!(e instanceof MissingReads) || round > 3) throw e;
        fetchInto(e.reads, main, versions, snapshot);
      }
    }
  });
  return {
    local: normal(local, localDir),
    planned: normal(planned, plannedDir),
    localPointer: normal(readPointer(localDir), localDir),
    plannedPointer: normal(readPointer(plannedDir), plannedDir),
    localStores: allStores(localDir),
    plannedStores: allStores(plannedDir),
  };
}

// The reads manifest across two Cycles: from `dataDir` after `prepare`, a snapshot of exactly
// the manifest's reads (both Cycles') plans; without any one, planning refuses and names it.
export function assertManifestAcross(dataDir, op, { args = [], input = '', prepare = () => {} } = {}) {
  const dir = cloneDataDir(dataDir);
  prepare(dir);
  const at = (url) => url && url.replace(dataDir, dir);
  const [pArgs, pInput] = [args.map(at), at(input)];
  const key = (r) => `${r.url ?? ''} ${readKey(r)}`;
  const attempt = (drop) => {
    const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-snap-'));
    const versions = path.join(snapshot, '..', `${path.basename(snapshot)}-versions.txt`);
    fs.writeFileSync(versions, '');
    const reads = readsFor({ op, args: pArgs, input: pInput, snapshot });
    fetchInto(reads.filter((_, j) => j !== drop), readPointer(dir).current, versions, snapshot);
    const got = outcome(() => planOperation({ snapshot, versions, out: planDir(), op, args: pArgs, input: pInput, pointer: pointerFile(dir), ...clock, rand: seededRand(3) }));
    return { reads, refusal: got.refusal };
  };
  const all = attempt(-1);
  assert.equal(all.refusal, undefined, `${op} with every read`);
  for (const [i, read] of all.reads.entries()) {
    const { refusal } = attempt(i);
    const named = (refusal ?? '').split('\n').filter((l) => l.startsWith('{')).map((l) => key(JSON.parse(l)));
    assert.ok(named.includes(key(read)), `${op} without ${key(read)}: ${refusal}`);
  }
}

// `refuses`: the case is a refusal (the pointer is then left out: setup wrote it before).
export function assertSameAcross(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = twoWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStores, r.localStores);
  if (!refuses) assert.deepEqual(r.plannedPointer, r.localPointer);
  return r;
}

// `refuses`: the case is a refusal; otherwise it must succeed.
export function assertSame(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = bothWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStore, r.localStore);
  return r;
}

export const BASE_ID = JSON.parse(fs.readFileSync(new URL('../../data/playbook.json', import.meta.url), 'utf8')).items[0].id;
export const GROUP = JSON.parse(fs.readFileSync(new URL('../../data/skills.json', import.meta.url), 'utf8')).groups[0].id;
export const NEW_CYCLE = { commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'] };

// A done Cycle with the Commander's scope: settings, a Skill of the Commander's an item is
// tagged to, a live and a retired item, a hidden base item.
export function previousCycle() {
  const f = fixture();
  const { store } = f;
  store.updateSettings({ role: 'מ"מ', talk: { target: 7 } });
  const { skill } = store.updateCycle({ addSkill: { group: GROUP, name: 'הקשבה' } });
  store.savePlaybookItem({ kind: 'tip', skills: [skill.id], text: 'לתת לה לסיים את המשפט' });
  const retired = store.savePlaybookItem({ kind: 'tip', skills: ['general'], text: 'פריט ישן' });
  store.retirePlaybookItem(retired.id);
  store.hidePlaybookItem(BASE_ID, true);
  return { ...f, previous: readPointer(f.dataDir).current };
}

// previousCycle, then setup of the next Cycle up to its seed (in progress).
export function newCycle() {
  const p = previousCycle();
  p.store.createCycle({ ...NEW_CYCLE, previous: p.previous });
  return { ...p, current: readPointer(p.dataDir).current };
}

// The payload of create-cycle.
export const createInput = ({ previous, trainees = NEW_CYCLE.trainees, extra = '' } = {}) => [
  'commander: רז', 'cycle: הכתומים', ...trainees.map((t) => `trainee: ${t}`), ...(previous ? [`previous: ${previous}`] : []), extra,
].join('\n');

// Setup on the artifact backend before createCycle: the new page published, and the pointer
// written with its address as current and the previous Cycle (`previous`: the current one, or
// the address given) added to archived. The page's folder is named as the local backend names a
// fresh store, from the same random source.
export const publishPage = (previous) => (dataDir) => {
  const page = `local:${path.join(dataDir, 'local', `c-${seededRand(3)(6)}`)}`;
  const pointer = readPointer(dataDir);
  const moved = previous === true ? pointer.current : previous;
  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current: page, archived: [...(pointer.archived ?? []), ...(moved ? [moved] : [])] }));
};
