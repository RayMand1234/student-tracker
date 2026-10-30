// The Commander's own Playbook: items added word-for-word, edited and retired, base items hidden
// and un-hidden, every change confirmed first, and an offer to save from an update never saved
// without a yes. Real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession } from './harness.mjs';

useEvalPointer();

function setUp() {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  const playbook = () => ({ items: store.readCycle().playbook, hides: store.readCycle().commander.hides.hidden });
  return { store, id, playbook, cwd: workspace() };
}

// The request alone changes nothing; "כן" in the same session applies it.
function confirmed({ cwd, playbook }, request) {
  const session = newSession();
  const before = playbook();
  console.log(`ask:\n${claude(cwd, request, session)}`);
  assert.deepEqual(playbook(), before, 'nothing changes before the Commander confirms');
  console.log(`confirm:\n${claude(cwd, 'כן', { ...session, resume: true })}`);
  return playbook();
}

const TIP = 'לבקש מהחניך להסביר לי את הקוד בקול לפני שאני מסתכל עליו';

test('adding an item: confirmed first, then saved word-for-word as the Commander\'s', () => {
  const ctx = setUp();
  const { items } = confirmed(ctx, `תוסיף לפלייבוק של דיבאג: ${TIP}`);
  assert.equal(items.length, 1, JSON.stringify(items));
  assert.equal(items[0].text.replace(/[.\s]+$/, ''), TIP);
  assert.deepEqual([items[0].origin, items[0].retired, items[0].source], ['commander', false, null]);
  assert.ok(items[0].skills.includes('impl.debugging'), items[0].skills.join(', '));
});

test('editing an item keeps its id and takes the new words', () => {
  const ctx = setUp();
  const { id: pid } = ctx.store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP });
  const NEW = 'לבקש מהחניך להסביר בקול מה הקוד אמור לעשות, שורה אחר שורה';
  const { items } = confirmed(ctx, `תשנה את הטיפ שלי על ההסבר בקול ל: ${NEW}`);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, pid);
  assert.equal(items[0].text.replace(/[.\s]+$/, ''), NEW);
  assert.equal(items[0].retired, false);
});

test('retiring an item keeps it stored, retired', () => {
  const ctx = setUp();
  const { id: pid } = ctx.store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP });
  const { items } = confirmed(ctx, 'תוריד מהפלייבוק את הטיפ שלי על ההסבר בקול, זה לא עובד לי');
  assert.equal(items.length, 1);
  assert.equal(items[0].id, pid);
  assert.ok(items[0].retired?.at, JSON.stringify(items[0]));
});

test('hiding a base item, and un-hiding one', () => {
  const hid = setUp();
  const { hides } = confirmed(hid, 'אל תציע לי יותר את הטיפ לשבת ליד החניך על באג ולשאול מה ציפית שיקרה');
  assert.deepEqual(hides, ['b-003']);

  const back = setUp();
  back.store.hidePlaybookItem('b-012', true);
  const after = confirmed(back, 'תחזיר לפלייבוק את הטיפ על זמן קצוב לנסות לבד');
  assert.deepEqual(after.hides, []);
});

test('an update with something that worked: the offer to save it is declined, and nothing is saved', () => {
  const ctx = setUp();
  const session = newSession();
  const reply = claude(ctx.cwd, 'דיברתי היום עם נועה על הבאגים. ביקשתי שתסביר לי בקול מה הקוד אמור לעשות, וככה היא מצאה לבד את הבאג תוך חמש דקות. זה ממש עבד.', session);
  console.log(`update:\n${reply}`);
  assert.equal(ctx.store.readTrainee(ctx.id['נועה']).evidence.length >= 1, true, 'the update is recorded');
  assert.match(reply, /פלייבוק/, 'offers to save what worked');
  assert.deepEqual(ctx.playbook().items, [], 'not saved before a yes');
  console.log(`decline:\n${claude(ctx.cwd, 'לא, לא צריך', { ...session, resume: true })}`);
  assert.deepEqual(ctx.playbook().items, [], 'nothing saved on a no');
});
