// The reads manifest (lean-turns spec, Testing Decisions): for an operation and its arguments, the
// reads the plan step needs. A snapshot holding exactly those reads plans; without any one of
// them, planning refuses and names it rather than taking a document it never fetched for absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreError } from '../lib/store.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, storeRoot, fetchReads, planDir, namesRead } from './fixtures/plan-seam.mjs';

const MARK = '[פרט אישי — בתיק]';

const plan = (snapshot, op, input) => planOperation({
  snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, input, now: () => NOW, rand: seededRand(3),
});

// A refusal's message, or null when planning succeeded.
function refusal(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return e.message;
  }
}

// record-entry cases over a fixture with stored history: {root, input}.
function recordEntryCases() {
  const { dataDir, id, store } = fixture();
  const [noa, dani] = [id['נועה'], id['דני']];
  const earlier = store.recordEntry({
    text: 'נועה פתרה את הבאג לבד. אבא שלה בבית חולים. לבדוק מה שלומה.',
    evidence: [{
      trainee: noa, kind: 'note', date: '2026-10-28', excerpt: `נועה פתרה את הבאג לבד. ${MARK}`,
      followups: ['לבדוק מה שלומה.'],
      sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.' }],
    }],
  });
  const root = storeRoot(dataDir);
  return [
    { root, input: `--- entry\nדיברתי עם דני.\n--- evidence ${dani} talk 2026-10-30\nדיברתי עם דני.\n` },
    {
      root,
      input: `--- entry
בדקתי מה שלומה של נועה, היא בסדר. דני עזר לה.
--- evidence ${noa} talk 2026-10-30
+closes: ${earlier.followups[0]}
בדקתי מה שלומה של נועה, היא בסדר.
--- evidence ${dani} note 2026-10-30
דני עזר לה.
--- assessment ${noa} impl.debugging 3 agent
+evidence: ${earlier.evidence[0]}, ${earlier.sensitive[0]}
פתרה לבד
--- status ${dani} watch
+evidence: #2
צריך לעקוב
`,
    },
  ];
}

test('record-entry: a snapshot of exactly the manifest\'s reads plans; without any one read, planning refuses and names it', () => {
  for (const { root, input } of recordEntryCases()) {
    const reads = readsFor({ op: 'record-entry', input });
    assert.equal(refusal(() => plan(fetchReads(root, reads), 'record-entry', input)), null);
    for (const [i, read] of reads.entries()) {
      const message = refusal(() => plan(fetchReads(root, reads.filter((_, j) => j !== i)), 'record-entry', input));
      assert.ok(namesRead(message, read), `without ${JSON.stringify(read)}: ${message}`);
    }
  }
});

test('a get that found nothing is a read of an absent document; a get never made is a missing read', () => {
  const { root } = recordEntryCases()[0];
  const input = `--- entry\nדיברתי עם מישהו.\n--- evidence t-nobody talk 2026-10-30\nדיברתי עם מישהו.\n`;
  const reads = readsFor({ op: 'record-entry', input });
  const card = { action: 'get', collection: 'trainees', doc_id: 't-nobody' };
  assert.ok(reads.some((r) => JSON.stringify(r) === JSON.stringify(card)), 'the manifest reads the named Trainee\'s card');

  assert.equal(refusal(() => plan(fetchReads(root, reads), 'record-entry', input)), 'unknown Trainee t-nobody');
  const missing = refusal(() => plan(fetchReads(root, []), 'record-entry', input));
  assert.match(missing, /missing reads/);
  assert.ok(namesRead(missing, card), missing);
});

test('every manifest read is an ArtifactData get, list or query, and a list or query asks for a whole page', () => {
  for (const { input } of recordEntryCases()) {
    for (const read of readsFor({ op: 'record-entry', input })) {
      const { action, collection, doc_id: docId, query, ...rest } = read;
      assert.deepEqual(rest, {}, JSON.stringify(read));
      assert.equal(collection.split('/').length % 2, 1, `a collection path has an odd number of segments: ${collection}`);
      if (action === 'get') {
        assert.ok(docId && !query, JSON.stringify(read));
      } else {
        assert.ok(['list', 'query'].includes(action) && !docId, JSON.stringify(read));
        assert.equal(query.limit, 1000);
        assert.equal(Boolean(query.where), action === 'query');
      }
    }
  }
});
