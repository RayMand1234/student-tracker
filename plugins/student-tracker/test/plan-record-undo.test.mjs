// Records outside an Entry, Entries too big for one batch, Retraction, Hard delete and resume,
// through snapshot → plan → apply (lean-turns 05). Each case runs both ways from the same state,
// as in equivalence.test.mjs, but the planned run fetches its reads the way the model does: the
// manifest first, then whatever "missing reads" names, until the plan goes through. Its batches
// are applied one at a time, in order, each against the state the ones before it left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, StoreError, VersionConflict } from '../lib/store.mjs';
import { MissingReads, MAX_BATCH_WRITES } from '../lib/docs.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, copyDataDir, storeRoot, contents, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';

const MARK = '[פרט אישי — בתיק]';
const clock = { now: () => NOW };

// Plans `op` over `root` as the model would: fetch the manifest's reads, plan, and on "missing
// reads" fetch those too and plan again. Gives {plan, reads}: the plan and every read it took.
function planOver(root, op, { args = [], input = '', insist = false, category, rand = seededRand(3) } = {}) {
  const reads = readsFor({ op, args, input });
  for (let round = 0; round < 6; round++) {
    const snapshot = fetchReads(root, reads);
    try {
      const plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, insist, category, ...clock, rand });
      return { plan, reads };
    } catch (e) {
      if (!(e instanceof MissingReads)) throw e;
      reads.push(...e.reads);
    }
  }
  throw new Error(`${op} kept asking for reads`);
}

const outcome = (fn) => {
  try {
    return { result: fn() };
  } catch (e) {
    if (!(e instanceof StoreError) || e instanceof MissingReads) throw e;
    return { refusal: e.message };
  }
};

// Runs `op` directly on a copy of `dataDir` and through the plan on another copy: both outcomes,
// both stores, and the planned run's batches.
function bothWays(dataDir, op, opts = {}) {
  const { args = [], input = '', insist = false, category } = opts;
  const localDir = copyDataDir(dataDir);
  const local = outcome(() => runOperation(openStore({ dataDir: localDir, ...clock, rand: seededRand(3) }), op, { args, input, insist, category }));
  const appliedDir = copyDataDir(dataDir);
  let batches = [];
  const planned = outcome(() => {
    const { plan } = planOver(storeRoot(appliedDir), op, opts);
    batches = plan.batches;
    applyPlan(storeRoot(appliedDir), plan.batches);
    return plan.result;
  });
  return { local, planned, batches, localStore: contents(storeRoot(localDir)), plannedStore: contents(storeRoot(appliedDir)) };
}

function assertSame(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = bothWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStore, r.localStore);
  return r;
}

// A Cycle where נועה has public Evidence, a sensitive part with a Follow-up, and an Assessment.
function withHistory() {
  const f = fixture();
  const noa = f.id['נועה'];
  const dani = f.id['דני'];
  const earlier = f.store.recordEntry({
    text: 'נועה פתרה את הבאג לבד. אבא שלה בבית חולים. לבדוק מה שלומה. דני עזר לה.',
    evidence: [
      {
        trainee: noa, kind: 'note', date: '2026-10-28', excerpt: `נועה פתרה את הבאג לבד. ${MARK}`,
        followups: ['נועה פתרה את הבאג לבד.'],
        sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.', followups: ['לבדוק מה שלומה.'] }],
      },
      { trainee: dani, kind: 'note', date: '2026-10-28', excerpt: 'דני עזר לה.' },
    ],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'פתרה לבד', evidence: ['#1'] }],
  });
  return { ...f, noa, dani, earlier };
}

test('record-assessments: Assessments and next-Talk questions outside an Entry, and their refusals, match', () => {
  const { dataDir, noa, earlier } = withHistory();
  const [pub] = earlier.evidence;
  const [part] = earlier.sensitive;
  assertSame(dataDir, 'record-assessments', {
    input: `--- assessment ${noa} impl.debugging 4 agent\n+evidence: ${pub}, ${part}\nבדיקה מחדש\n--- next-talk ${noa}\nאיך הולך עם הדיבאג?\nמה למדת השבוע?\n`,
  });
  for (const input of [
    `--- assessment ${noa} impl.debugging 4 agent\n+evidence: e-nothing-1\nבדיקה מחדש\n`,
    `--- assessment ${noa} impl.nothing 4 agent\n+evidence: ${pub}\nבדיקה מחדש\n`,
    `--- assessment ${noa} impl.debugging 4 agent\n+evidence: ${pub}\nאבא שלה בבית חולים\n`,
    `--- assessment t-nobody impl.debugging 4 agent\n+evidence: ${pub}\nבדיקה\n`,
  ]) {
    assertSame(dataDir, 'record-assessments', { input, refuses: true });
  }
});

test('record-next-talk and record-snapshot: the change record and card match, and so do their refusals', () => {
  const { dataDir, noa } = withHistory();
  assertSame(dataDir, 'record-next-talk', { input: `--- next-talk ${noa}\nאיך הולך עם הדיבאג?\nמה למדת השבוע?\n` });
  assertSame(dataDir, 'record-next-talk', { input: `--- next-talk ${noa}\nאיך אבא שלה בבית חולים?\nמה למדת השבוע?\n`, refuses: true });
  assertSame(dataDir, 'record-next-talk', { input: `--- next-talk t-nobody\nאיך הולך?\nמה למדת?\n`, refuses: true });
  assertSame(dataDir, 'record-snapshot', { input: `--- snapshot ${noa}\nמתקדמת יפה בדיבאג.\n` });
  assertSame(dataDir, 'record-snapshot', { input: `--- snapshot ${noa}\nאבא שלה בבית חולים.\n`, refuses: true });
});

test('flip-sensitive: marking public Evidence sensitive and back moves it with its Follow-ups, as on the local backend', () => {
  const { dataDir, earlier } = withHistory();
  const [pub] = earlier.evidence;
  const [part] = earlier.sensitive;
  assertSame(dataDir, 'flip-sensitive', { args: [pub], category: 'health' });
  assertSame(dataDir, 'flip-sensitive', { args: [part] });
  assertSame(dataDir, 'flip-sensitive', { args: [pub], refuses: true }); // marking needs a category
  assertSame(dataDir, 'flip-sensitive', { args: [earlier.followups[0]], refuses: true });
  assertSame(dataDir, 'flip-sensitive', { args: ['e-nothing-1'], refuses: true });
});

test('retract-entry and hard-delete: the last Entry or a named one, sensitive records included, as on the local backend', () => {
  const { dataDir, earlier, store, noa } = withHistory();
  store.recordEntry({ text: 'נועה הגיעה בזמן.', evidence: [{ trainee: noa, kind: 'note', date: '2026-10-29', excerpt: 'נועה הגיעה בזמן.' }] });
  assertSame(dataDir, 'retract-entry', {});
  assertSame(dataDir, 'retract-entry', { args: [earlier.entry] });
  assertSame(dataDir, 'hard-delete', { args: [earlier.entry] });
  assertSame(dataDir, 'retract-entry', { args: ['e-nothing'], refuses: true });
  assertSame(dataDir, 'hard-delete', { args: [], refuses: true });
  store.retractEntry(earlier.entry);
  assertSame(dataDir, 'retract-entry', { args: [earlier.entry], refuses: true }); // already retracted
  assertSame(dataDir, 'hard-delete', { args: [earlier.entry] }); // a retracted Entry can still be deleted
});

// An Entry too big for one batch: each Trainee gets a Talk opening `followups` Follow-ups.
function bigEntry(tids, followups = 17) {
  const blocks = tids.map((tid, i) => {
    const tasks = Array.from({ length: followups }, (_, j) => `משימה ${i}.${j} לשבוע הבא.`);
    return { sentence: `דיברתי עם חניך ${i}. ${tasks.join(' ')}`, block: `--- evidence ${tid} talk 2026-10-30\nדיברתי עם חניך ${i}.\n${tasks.map((t) => `--- followup\n${t}\n`).join('')}` };
  });
  return `--- entry\n${blocks.map((b) => b.sentence).join(' ')}\n${blocks.map((b) => b.block).join('')}`;
}
const TEAM = ['נועה', 'דני', 'יעל'];

test('an Entry too big for one batch: the Entry at writing, one batch per Trainee, then done, each batch pinned to what the ones before it left', () => {
  const { dataDir, id } = fixture(TEAM);
  const input = bigEntry(TEAM.map((n) => id[n]));
  const r = assertSame(dataDir, 'record-entry', { input });
  assert.equal(r.batches.length, TEAM.length + 2, 'the Entry, a batch per Trainee, the Entry done');
  for (const b of r.batches) assert.ok(b.length >= 1 && b.length <= MAX_BATCH_WRITES);
  const [first, ...rest] = r.batches;
  const entry = (b) => b.find((w) => w.collection === 'entries');
  assert.deepEqual(first.map((w) => w.collection), ['entries']);
  assert.equal(entry(first).if_version, undefined, 'the Entry is created');
  assert.equal(entry(rest.at(-1)).if_version, 1, 'marking it done pins the version its creation gave');
  // A refusal of a big Entry is the same refusal, and nothing is planned.
  assertSame(dataDir, 'record-entry', { input: bigEntry([id['נועה'], 't-nobody']), refuses: true });
});

// Stops a planned run after its first `n` batches, then plans resume-pending over a fresh
// snapshot and sends that: the store it leaves, and what resume-pending finished.
function interruptThenResume(dataDir, op, opts, n) {
  const root = storeRoot(copyDataDir(dataDir));
  const { plan } = planOver(root, op, opts);
  applyPlan(root, plan.batches.slice(0, n));
  const resume = planOver(root, 'resume-pending').plan;
  applyPlan(root, resume.batches);
  return { store: contents(root), finished: resume.result.finished, batches: plan.batches };
}

test('interrupted after any batch, a big Entry, Retraction or Hard delete is finished by resume-pending\'s plan', () => {
  const { dataDir, id } = fixture(TEAM);
  const record = { input: bigEntry(TEAM.map((n) => id[n])) };
  // Withdrawals of an Entry about the whole team, too big for one batch.
  const recorded = fixture(TEAM);
  const { entry } = runOperation(recorded.store, 'record-entry', { input: bigEntry(TEAM.map((n) => recorded.id[n])) });
  const cases = [
    { dataDir, op: 'record-entry', opts: record },
    { dataDir: recorded.dataDir, op: 'retract-entry', opts: { args: [entry] } },
    { dataDir: recorded.dataDir, op: 'hard-delete', opts: { args: [entry] } },
  ];
  for (const c of cases) {
    const whole = bothWays(c.dataDir, c.op, c.opts);
    assert.deepEqual(whole.plannedStore, whole.localStore, c.op);
    assert.ok(whole.batches.length > 2, `${c.op} takes several batches`);
    const finished = whole.local.result.entry;
    for (let n = 1; n < whole.batches.length; n++) {
      const r = interruptThenResume(c.dataDir, c.op, c.opts, n);
      assert.deepEqual(r.finished, [finished], `${c.op} stopped after batch ${n}`);
      assert.deepEqual(r.store, whole.localStore, `${c.op} stopped after batch ${n}, then resumed`);
    }
  }
});

test('a later batch refused (another session moved a card): the ones before it stand, and resume-pending finishes the Entry', () => {
  const { dataDir, id } = fixture(TEAM);
  const root = storeRoot(dataDir);
  const tids = TEAM.map((n) => id[n]);
  const { plan } = planOver(root, 'record-entry', { input: bigEntry(tids) });
  applyPlan(root, plan.batches.slice(0, 3));
  // Another session writes about the last Trainee before their batch goes out.
  openStore({ dataDir, ...clock, rand: seededRand(11) }).recordNextTalk(tids[2], ['איך הולך?', 'מה למדת?']);
  const moved = contents(root);
  assert.throws(() => applyPlan(root, plan.batches.slice(3)), VersionConflict);
  assert.deepEqual(contents(root), moved, 'the refused batch wrote nothing');

  // Resuming reads the Entries, then the cards and records of the Entry's Trainees.
  assertReadsNeeded(root, { op: 'resume-pending', took: tids });
  const resume = planOver(root, 'resume-pending').plan;
  assert.deepEqual(resume.result.finished, [plan.result.entry]);
  applyPlan(root, resume.batches);
  const after = openStore({ dataDir });
  for (const tid of tids) {
    const { evidence, card } = after.readTrainee(tid);
    assert.equal(evidence.length, 1, `${tid}'s Talk is recorded once`);
    assert.equal(card.followups.length, 17);
    assert.deepEqual(after.rebuildCard(tid), { id: tid, ...card }, 'the card matches its records');
  }
  assert.deepEqual(after.readTrainee(tids[2]).card.nextTalk.questions, ['איך הולך?', 'מה למדת?'], 'the other session\'s write stands');
  assert.equal(contents(root)[`entries/${plan.result.entry}`].status, 'done');
});

test('a plan of several batches says what to do when one of them is refused', () => {
  const { dataDir, id } = fixture(TEAM);
  const { plan } = planOver(storeRoot(dataDir), 'record-entry', { input: bigEntry(TEAM.map((n) => id[n])) });
  assert.match(plan.if_refused, /resume-pending/);
  const small = planOver(storeRoot(dataDir), 'record-entry', { input: bigEntry([id['נועה']], 1) }).plan;
  assert.equal(small.batches.length, 1);
  assert.equal(small.if_refused, undefined, 'one batch: the usual re-read, re-plan, resend');
});

// The reads of one Trainee's card and records, as the manifests name them.
const traineeReads = (tid) => [
  { action: 'get', collection: 'trainees', doc_id: tid },
  ...['evidence', 'followups', 'items', 'assessments', 'changes'].map((k) => ({ action: 'list', collection: `trainees/${tid}/${k}`, query: { limit: 1000 } })),
  { action: 'query', collection: 'sensitive', query: { where: [['trainee', '==', tid]], limit: 1000 } },
];
const keys = (reads) => reads.map((r) => JSON.stringify(r)).sort();

test('reads: each operation plans over exactly the reads it took, and without any one of them refuses and names it', () => {
  const { dataDir, earlier, noa, dani } = withHistory();
  const root = storeRoot(dataDir);
  const [pub] = earlier.evidence;
  const [part] = earlier.sensitive;
  const cases = [
    { op: 'record-assessments', input: `--- assessment ${noa} impl.debugging 4 agent\n+evidence: ${pub}, ${part}\nבדיקה מחדש\n--- next-talk ${noa}\nאיך הולך?\nמה למדת?\n` },
    { op: 'record-next-talk', input: `--- next-talk ${noa}\nאיך הולך?\nמה למדת?\n` },
    { op: 'record-snapshot', input: `--- snapshot ${noa}\nמתקדמת יפה.\n` },
    { op: 'flip-sensitive', args: [pub], category: 'health', took: [noa, dani] },
    { op: 'flip-sensitive', args: [part], took: [noa, dani] },
    // An Entry's Trainees are read once the Entry is: their cards, records and sensitive query.
    { op: 'retract-entry', args: [earlier.entry], took: [noa, dani] },
    { op: 'hard-delete', args: [earlier.entry], took: [noa, dani] },
    { op: 'resume-pending', took: [] },
  ];
  for (const c of cases) assertReadsNeeded(root, c);
});

// Plans `op` over `root`, fetching what it asks for; every read it took is needed (without any
// one, planning refuses and names it). `took`: the Trainees whose card reads it may add to its
// manifest, and nothing else.
function assertReadsNeeded(root, { took, ...c }) {
  const { reads } = planOver(root, c.op, c);
  if (took) {
    const allowed = new Set(keys([...readsFor(c), ...took.flatMap(traineeReads)]));
    assert.deepEqual(keys(reads).filter((k) => !allowed.has(k)), [], `${c.op} reads no record one by one`);
  }
  for (const [i, read] of reads.entries()) {
    const snapshot = fetchReads(root, reads.filter((_, j) => j !== i));
    const plan = () => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), ...c, ...clock, rand: seededRand(3) });
    assert.throws(plan, (e) => e instanceof MissingReads && e.message.includes(JSON.stringify(read)), `${c.op} without ${JSON.stringify(read)}`);
  }
}
