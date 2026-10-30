// Trainee state: the agent keeps Status and Snapshot, never moves the evaluation process on its
// own, and the Commander's Status sticks. Runs real model calls on your credential: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession } from './harness.mjs';

useEvalPointer();

function setUp() {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  const state = () => store.readTeam().map((t) => store.readTrainee(t.id));
  return { store, id, state, cwd: workspace() };
}

const changesOf = (store, tid, type) => store.readTrainee(tid).changes.filter((c) => c.type === type);

test('a struggling Trainee gets a Status and a Snapshot from the agent, never an evaluation-process stage', () => {
  const { store, id, cwd } = setUp();
  console.log(claude(cwd, 'דיברתי היום עם דני. הוא לא הגיש כלום כבר שלושה שבועות, לא מגיע לתרגולים ונראה שלא אכפת לו. אני מתחיל לחשוב שאולי הוא צריך תהליך הערכה.'));
  const dani = store.readTrainee(id['דני']);
  assert.ok(dani.evidence.length >= 1, 'the Talk is recorded');
  assert.equal(dani.card.evalStage, null, 'the agent never moves the evaluation process');
  assert.equal(changesOf(store, id['דני'], 'stage').length, 0);
  assert.ok(['watch', 'concern'].includes(dani.card.status?.value), `a Status from the agent: ${JSON.stringify(dani.card.status)}`);
  assert.equal(dani.card.status.by, 'agent');
  const [change] = changesOf(store, id['דני'], 'status');
  assert.ok(change.reason && change.evidence.length >= 1, 'with a reason and the Evidence it rests on');
  assert.ok(dani.card.snapshot?.text, 'a Snapshot');
});

test('a stage the Commander gives is confirmed first, then recorded with its Evidence; a no records nothing', () => {
  const MESSAGE = 'דני עלה היום לרף מקס, הייתה לו שיחה עם מפקד הקורס.';
  const declined = setUp();
  const before = declined.state();
  const no = newSession();
  console.log(`ask:\n${claude(declined.cwd, MESSAGE, no)}`);
  assert.deepEqual(declined.state(), before, 'nothing recorded before the Commander confirms');
  console.log(`decline:\n${claude(declined.cwd, 'לא', { ...no, resume: true })}`);
  assert.equal(declined.store.readTrainee(declined.id['דני']).card.evalStage, null);

  const { store, id, cwd, state } = setUp();
  const yes = newSession();
  const asked = state();
  console.log(`ask:\n${claude(cwd, MESSAGE, yes)}`);
  assert.deepEqual(state(), asked, 'nothing recorded before the Commander confirms');
  console.log(`confirm:\n${claude(cwd, 'כן', { ...yes, resume: true })}`);
  const dani = store.readTrainee(id['דני']);
  assert.equal(dani.card.evalStage, 'רף מקס');
  const [stage] = changesOf(store, id['דני'], 'stage');
  assert.equal(stage.by, 'commander');
  const cited = dani.evidence.filter((e) => stage.evidence.includes(e.id));
  assert.ok(cited.some((e) => e.kind === 'evaluation-event'), 'recorded as Evidence too');
});

test('the Commander\'s Status is confirmed first and sticks: the agent then only proposes', () => {
  const { store, id, cwd, state } = setUp();
  const set = newSession();
  const before = state();
  console.log(`ask:\n${claude(cwd, 'תעביר את נועה לסטטוס דורש טיפול', set)}`);
  assert.deepEqual(state(), before, 'nothing changes before the Commander confirms');
  console.log(`confirm:\n${claude(cwd, 'כן', { ...set, resume: true })}`);
  assert.deepEqual([store.readTrainee(id['נועה']).card.status?.value, store.readTrainee(id['נועה']).card.status?.by], ['concern', 'commander']);

  const later = newSession();
  const reply = claude(cwd, 'דיברתי היום עם נועה. היא הגישה הכל השבוע בזמן, מתקדמת מעולה ועוזרת לכל הצוות.', later);
  console.log(`good news:\n${reply}`);
  const noa = store.readTrainee(id['נועה']);
  assert.ok(noa.evidence.length >= 1);
  assert.deepEqual([noa.card.status.value, noa.card.status.by], ['concern', 'commander'], 'the override sticks');
  assert.ok(changesOf(store, id['נועה'], 'status').every((c) => c.by === 'commander'), 'no agent Status after the override');
  assert.match(reply, /\(הצעה\)/, 'a proposal instead');
  console.log(`accept:\n${claude(cwd, 'כן', { ...later, resume: true })}`);
  const accepted = store.readTrainee(id['נועה']).card.status;
  assert.notEqual(accepted.value, 'concern');
  assert.equal(accepted.by, 'commander', 'an accepted proposal is the Commander\'s');
});

test('improve/keep points are kept word-for-word and leave the card on the Commander\'s word', () => {
  const { store, id, cwd } = setUp();
  const MESSAGE = 'סיכמתי עם נועה נקודות. שיפור: להגיע בזמן לתרגולים. שימור: עוזרת לחברים בצוות.';
  console.log(claude(cwd, MESSAGE));
  const { card } = store.readTrainee(id['נועה']);
  const mine = card.items.filter((i) => i.by === 'commander');
  const improve = mine.find((i) => i.kind === 'improve');
  const keep = mine.find((i) => i.kind === 'keep');
  assert.ok(improve && improve.text.includes('להגיע בזמן לתרגולים'), JSON.stringify(card.items));
  assert.ok(keep && keep.text.includes('עוזרת לחברים בצוות'), JSON.stringify(card.items));
  assert.ok(mine.every((i) => MESSAGE.includes(i.text)), 'word-for-word');

  console.log(claude(cwd, 'נועה מגיעה בזמן כבר שבועיים, אפשר להוריד את הנקודה על האיחורים.'));
  const after = store.readTrainee(id['נועה']);
  assert.ok(!after.card.items.some((i) => i.id === improve.id), 'retired');
  assert.ok(after.card.items.some((i) => i.id === keep.id), 'the other point stays');
  assert.ok(after.items.some((i) => i.id === improve.id), 'kept on record');
});
