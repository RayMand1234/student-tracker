// The reads manifest for reads, status, Playbook selection and alerts (lean-turns 04): a snapshot
// holding exactly the manifest's reads plans; without any one of them, planning refuses and names it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreError } from '../lib/store.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { seededRand, fixture, fetchReads, planDir, namesRead } from './fixtures/plan-seam.mjs';

const LATER = new Date('2026-11-20T09:00:00');

function refusal(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return e.message;
  }
}

test('reads, status, Playbook, alerts and rebuild-card: exactly the manifest\'s reads plan; without any one, planning refuses and names it', () => {
  const { root, id, store } = fixture();
  const noa = id['נועה'];
  store.recordEntry({ text: 'דיברתי עם נועה.', evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-29', excerpt: 'דיברתי עם נועה.' }] });
  const rows = [
    ['read-cycle', {}],
    ['read-team', {}],
    ['read-trainee', { args: [noa] }],
    ['read-trainee', { args: [noa], since: '2026-10-30', retracted: true }],
    ['read-playbook', { args: [noa] }],
    ['read-playbook', { args: [noa, 'impl.debugging'] }],
    ['read-status', {}],
    ['take-alert', {}],
    ['take-alert', { args: [noa, 'מאחר'] }],
    ['rebuild-card', { args: [noa] }],
  ];
  for (const [op, { args = [], ...opts }] of rows) {
    const plan = (snapshot) => planOperation({
      snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, ...opts, now: () => LATER, rand: seededRand(3),
    });
    const reads = readsFor({ op, args });
    assert.equal(refusal(() => plan(fetchReads(root, reads))), null, `${op} ${args.join(' ')}`);
    for (const [i, read] of reads.entries()) {
      const message = refusal(() => plan(fetchReads(root, reads.filter((_, j) => j !== i))));
      assert.ok(namesRead(message, read), `${op} without ${JSON.stringify(read)}: ${message}`);
    }
  }
});
