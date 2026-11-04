// The reads manifest (lean-turns spec, Testing Decisions) for the roster, settings, Cycle-change
// and Playbook operations: a snapshot holding exactly the manifest's reads plans; without any one
// of them, planning refuses and names it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreError } from '../lib/store.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, storeRoot, fetchReads, planDir } from './fixtures/plan-seam.mjs';

const plan = (snapshot, op, { args, input }) => planOperation({
  snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, now: () => NOW, rand: seededRand(3),
});

function refusal(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return e.message;
  }
}

// Plans with every read, then with each read dropped in turn.
function assertManifest(root, op, { args = [], input = '' } = {}) {
  const reads = readsFor({ op, args, input });
  assert.equal(refusal(() => plan(fetchReads(root, reads), op, { args, input })), null, `${op} ${args.join(' ')} with every read`);
  for (const [i, read] of reads.entries()) {
    const message = refusal(() => plan(fetchReads(root, reads.filter((_, j) => j !== i)), op, { args, input }));
    assert.ok(message?.includes(JSON.stringify(read)), `${op} ${args.join(' ')} without ${JSON.stringify(read)}: ${message}`);
  }
}

function withHistory() {
  const f = fixture(['נועה', 'דני']);
  const [noa, dani] = [f.id['נועה'], f.id['דני']];
  const entry = f.store.recordEntry({
    text: 'נועה פתרה את הבאג לבד.',
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-28', excerpt: 'נועה פתרה את הבאג לבד.' }],
  });
  f.store.updateTrainee(dani, { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' } });
  return { root: storeRoot(f.dataDir), noa, dani, entry, store: f.store };
}

test('update-settings and update-trainee: exactly the manifest\'s reads plan', () => {
  const { root, noa, dani, entry } = withHistory();
  assertManifest(root, 'update-settings', { input: 'target: 7\n' });
  assertManifest(root, 'update-trainee', { input: 'add: יואב\n' });
  assertManifest(root, 'update-trainee', { args: [noa], input: 'rename: נועה כ.\n' });
  assertManifest(root, 'update-trainee', { args: [noa], input: `status: watch\nreason: צריכה ליווי\nevidence: ${entry.evidence[0]}\n` });
  assertManifest(root, 'update-trainee', { args: [noa], input: 'leave: 2026-10-30\nhow: other\nreason: סיימה\n' });
  assertManifest(root, 'update-trainee', { args: [dani], input: 'rejoin\n' });
});
