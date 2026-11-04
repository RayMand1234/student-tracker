// One engine for both backends (lean-turns spec): an operation run directly on the local backend
// and the same operation run through snapshot → plan → apply leave identical stores and give
// identical refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, StoreError, VersionConflict } from '../lib/store.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, copyDataDir, storeRoot, contents, snapshotOf, applyPlan, planDir } from './fixtures/plan-seam.mjs';

const clock = { now: () => NOW };

// Runs `op` both ways from the same state: {local, planned}, each {result} or {refusal}, plus
// both stores' contents afterwards.
function bothWays(dataDir, op, { args = [], input, insist = false } = {}) {
  const outcome = (fn) => {
    try {
      return { result: fn() };
    } catch (e) {
      if (!(e instanceof StoreError)) throw e;
      return { refusal: e.message };
    }
  };
  const localDir = copyDataDir(dataDir);
  const local = outcome(() => runOperation(openStore({ dataDir: localDir, ...clock, rand: seededRand(3) }), op, { args, input, insist }));

  const appliedDir = copyDataDir(dataDir);
  const snapshot = snapshotOf(storeRoot(appliedDir));
  const planned = outcome(() => {
    const plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, insist, ...clock, rand: seededRand(3) });
    applyPlan(storeRoot(appliedDir), plan.batches);
    return plan.result;
  });
  return { local, planned, localStore: contents(storeRoot(localDir)), plannedStore: contents(storeRoot(appliedDir)) };
}

// `refuses`: the case is a refusal; otherwise it must succeed.
function assertSame(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = bothWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStore, r.localStore);
  return r;
}

test('a Talk with one Evidence: the same store and result both ways', () => {
  const { dataDir, id } = fixture();
  const r = assertSame(dataDir, 'record-entry', {
    input: `--- entry\nדיברתי היום עם נועה על הדיבאג.\n--- evidence ${id['נועה']} talk 2026-10-30\n+topics: דיבאג\nדיברתי היום עם נועה על הדיבאג.\n`,
  });
  assert.ok(r.local.result.entry, 'the Entry was recorded');
});

const MARK = '[פרט אישי — בתיק]';

test('a Talk with a sensitive part and Follow-ups on both sides: the same store both ways', () => {
  const { dataDir, id } = fixture();
  const text = 'דיברתי עם נועה על הפרויקט. ההורים שלה מתגרשים. לבדוק איך היא מסתדרת. לשיחה הבאה: הדיבאג';
  assertSame(dataDir, 'record-entry', {
    input: `--- entry
${text}
--- evidence ${id['נועה']} talk 2026-10-30
+topics: פרויקט
דיברתי עם נועה על הפרויקט. ${MARK} לשיחה הבאה: הדיבאג
--- followup
לשיחה הבאה: הדיבאג
--- sensitive family
+kind: background
ההורים שלה מתגרשים. לבדוק איך היא מסתדרת.
--- followup
לבדוק איך היא מסתדרת.
`,
  });
});

test('an Entry about two Trainees with Assessments, items, Status, stage, Snapshot and next-Talk questions', () => {
  const { dataDir, id } = fixture();
  const [noa, dani] = [id['נועה'], id['דני']];
  assertSame(dataDir, 'record-entry', {
    input: `--- entry
נועה עלתה לרף מקס. שיפור: להגיע בזמן. דני מצא לבד את הבאג.
--- evidence ${noa} evaluation-event 2026-10-30
נועה עלתה לרף מקס.
--- evidence ${noa} improve-keep 2026-10-30
שיפור: להגיע בזמן.
--- evidence ${dani} note 2026-10-30
דני מצא לבד את הבאג.
--- assessment ${dani} impl.debugging 4 agent
+evidence: #3
מצא את הבאג לבד
--- item ${noa} improve commander
+from: #2
להגיע בזמן
--- stage ${noa}
+to: רף מקס
+evidence: #1
--- status ${noa} concern
+evidence: #1, #2
נכנסה לתהליך הערכה
--- snapshot ${noa}
בתהליך הערכה; מתקשה בזמנים.
--- next-talk ${dani}
איך מצאת את הבאג?
מה היית עושה אחרת?
`,
  });
});

test('refusals match: an unknown Trainee, a public text holding a sensitive part, a Follow-up that is not open', () => {
  const { dataDir, id } = fixture();
  const noa = id['נועה'];
  const cases = [
    `--- entry\nדיברתי עם מישהו.\n--- evidence t-nobody talk 2026-10-30\nדיברתי עם מישהו.\n`,
    `--- entry\nנועה חולה. דיברנו.\n--- evidence ${noa} talk 2026-10-30\nנועה חולה. דיברנו.\n--- sensitive health\nנועה חולה.\n`,
    `--- entry\nדיברנו.\n--- evidence ${noa} talk 2026-10-30\n+closes: f-none\nדיברנו.\n`,
  ];
  for (const input of cases) {
    assertSame(dataDir, 'record-entry', { input, refuses: true });
  }
});

test('an Entry after an earlier one builds on it: cards, the Follow-up it closes and ids match', () => {
  const { dataDir, id, store } = fixture();
  const noa = id['נועה'];
  const { followups } = store.recordEntry({
    text: 'דיברתי עם נועה. לבדוק את התרץ.',
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-29', excerpt: 'דיברתי עם נועה.', followups: ['לבדוק את התרץ.'] }],
  });
  assertSame(dataDir, 'record-entry', {
    input: `--- entry\nבדקתי את התרץ של נועה, הכל טוב.\n--- evidence ${noa} note 2026-10-30\n+closes: ${followups[0]}\nבדקתי את התרץ של נועה, הכל טוב.\n`,
  });
});

test('a stale pin: apply refuses and writes nothing; a fresh snapshot, re-plan and apply succeed', () => {
  const { dataDir, id } = fixture();
  const noa = id['נועה'];
  const root = storeRoot(dataDir);
  const input = `--- entry\nדיברתי עם נועה על הדיבאג.\n--- evidence ${noa} talk 2026-10-30\nדיברתי עם נועה על הדיבאג.\n`;
  const plan = (snapshot) => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'record-entry', input, ...clock, rand: seededRand(3) });
  const stale = plan(snapshotOf(root));

  // Another session writes about the same Trainee between the snapshot and the send.
  openStore({ dataDir, ...clock, rand: seededRand(9) }).recordEntry({
    text: 'נועה הגיעה בזמן.', evidence: [{ trainee: noa, kind: 'note', date: '2026-10-30', excerpt: 'נועה הגיעה בזמן.' }],
  });
  const moved = contents(root);
  assert.throws(() => applyPlan(root, stale.batches), VersionConflict);
  assert.deepEqual(contents(root), moved, 'the refused batch wrote nothing');

  applyPlan(root, plan(snapshotOf(root)).batches);
  const now = openStore({ dataDir }).readTrainee(noa);
  assert.deepEqual(now.evidence.map((e) => e.excerpt).sort(), ['דיברתי עם נועה על הדיבאג.', 'נועה הגיעה בזמן.'].sort());
  assert.equal(now.card.lastTalk, '2026-10-30');
});
