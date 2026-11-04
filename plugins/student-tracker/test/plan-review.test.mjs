// Code-review cases for the plan step (lean-turns): what a plan does when a create meets an
// existing id, where its missing reads save, archived-Cycle writes, truncated pages, recovery
// advice and argument checks. Run through the snapshot → plan → apply seam (plan-seam.mjs) and the CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AlreadyExists, MissingReads } from '../lib/docs.mjs';
import { openStore } from '../lib/store.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, storeRoot, contents, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';

const clock = { now: () => NOW };

test('a planned create whose id another session took meanwhile is refused, not overwritten', () => {
  const { dataDir, id } = fixture();
  const input = `--- entry\nנועה עזרה בדיבאג.\n--- evidence ${id['נועה']} note 2026-10-30\nנועה עזרה בדיבאג.\n`;
  const root = storeRoot(dataDir);
  const snapshot = fetchReads(root, readsFor({ op: 'record-entry', input }));
  const plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'record-entry', input, ...clock, rand: seededRand(3) });
  const creates = plan.batches.flat().filter((w) => w.op === 'set' && w.if_version === undefined);
  assert.ok(creates.length, 'the plan creates records');

  // Another session writes a document at one of those ids between the reads and the send.
  const [taken] = creates;
  const other = { theirs: true };
  fs.mkdirSync(`${root}/${taken.collection}`, { recursive: true });
  fs.writeFileSync(`${root}/${taken.collection}/${taken.doc_id}.json`, JSON.stringify({ version: 1, data: other }));
  const before = contents(root);

  assert.throws(() => applyPlan(root, plan.batches), AlreadyExists);
  assert.deepEqual(contents(root), before, 'nothing written, their document kept');
});

test('the test apply refuses an unpinned set on an existing document, as the database does', () => {
  const { dataDir } = fixture();
  const root = storeRoot(dataDir);
  const before = contents(root);
  const file = `${planDir()}/cycle.json`;
  fs.writeFileSync(file, JSON.stringify({ name: 'overwritten' }));
  assert.throws(() => applyPlan(root, [[{ op: 'set', collection: 'meta', doc_id: 'cycle', file_path: file }]]), AlreadyExists);
  assert.deepEqual(contents(root), before);
});

// A Cycle with one Entry about נועה, recorded on the local backend.
function withEntry() {
  const f = fixture();
  const input = `--- entry\nנועה עזרה בדיבאג.\n--- evidence ${f.id['נועה']} note 2026-10-30\nנועה עזרה בדיבאג.\n`;
  runOperation(openStore({ dataDir: f.dataDir, ...clock, rand: seededRand(5) }), 'record-entry', { input });
  return f;
}

const missingReads = (fn) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MissingReads) return e.reads;
    throw e;
  }
  return assert.fail('expected missing reads');
};

test('missing reads the run meets save into the snapshot folder (out_dir), like the manifest\'s', () => {
  const { dataDir } = withEntry();
  const snapshot = fetchReads(storeRoot(dataDir), readsFor({ op: 'retract-entry' }));
  const reads = missingReads(() => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'retract-entry', ...clock }));
  assert.ok(reads.length, 'the Trainee\'s card reads');
  for (const r of reads) assert.equal(r.out_dir, fs.realpathSync.native(snapshot.dir), JSON.stringify(r));
});

test('a manifest read left out of the versions list is asked for with its out_dir', () => {
  const { dataDir } = withEntry();
  const [first, ...rest] = readsFor({ op: 'retract-entry' });
  const snapshot = fetchReads(storeRoot(dataDir), rest);
  const reads = missingReads(() => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'retract-entry', ...clock }));
  assert.deepEqual(reads, [{ ...first, out_dir: fs.realpathSync.native(snapshot.dir) }]);
});
