// The snapshot → plan → apply seam (plan-seam.mjs) for the roster, settings, Playbook and Cycle
// lifecycle operations. Each runs (a) directly on a copy of a local fixture and (b) as the model
// runs it on the artifact backend: the manifest's reads fetched into a snapshot, the plan step,
// then the plan's batches sent. Both runs get the same fixed clock and random source.
import assert from 'node:assert/strict';
import { openStore, StoreError } from '../../lib/store.mjs';
import { runOperation } from '../../lib/operations.mjs';
import { planOperation, readsFor } from '../../lib/plan.mjs';
import { NOW, seededRand, copyDataDir, storeRoot, contents, fetchReads, applyPlan, planDir } from './plan-seam.mjs';

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

// `refuses`: the case is a refusal; otherwise it must succeed.
export function assertSame(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = bothWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStore, r.localStore);
  return r;
}
