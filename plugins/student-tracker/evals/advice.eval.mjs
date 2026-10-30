// Advice: suggestions marked (הצעה), grounded in the Trainee's Evidence, never stored unless
// accepted; and fresh next-Talk questions with every Entry. Real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day } from './harness.mjs';

useEvalPointer();

function setUp() {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id, cwd: workspace() };
}

// Noa is weak at debugging; sitting with Dani on her bugs was already tried and didn't help.
function seedNoa(store, noa) {
  const talk = 'דיברתי עם נועה. בתרץ היא נתקעה שעה על באג אחד ולא הדפיסה כלום, רק שינתה דברים באקראי עד שזה עבד.';
  const r = store.recordEntry({
    text: talk,
    evidence: [{ trainee: noa, kind: 'talk', date: day(-6), excerpt: talk, topics: ['דיבאג'] }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 2, author: 'agent', reason: 'נתקעת על באגים בלי שיטה', evidence: ['#1'] }],
  });
  const tried = 'נועה ישבה כל השבוע עם דני על הבאגים שלה, זה לא עזר, היא עדיין מחכה שהוא יפתור.';
  store.recordEntry({
    text: tried,
    evidence: [{ trainee: noa, kind: 'note', date: day(-2), excerpt: tried }],
    assessments: [{ trainee: noa, skill: 'learn.independence', score: 2, author: 'agent', reason: 'מחכה שאחרים יפתרו', evidence: ['#1', r.evidence[0]] }],
  });
}

const everything = (store) => [store.readCycle(), ...store.readTeam().map((t) => store.readTrainee(t.id, { retracted: true }))];

test('advice on one Trainee is 2–3 suggestions marked (הצעה), stores nothing, and an accepted one becomes an improve item', () => {
  const { store, id, cwd } = setUp();
  seedNoa(store, id['נועה']);
  const before = everything(store);
  const session = newSession();
  const reply = claude(cwd, 'איך לעזור לנועה בדיבאג?', session);
  console.log(`advice:\n${reply}`);
  const marked = reply.match(/\(הצעה\)/g) ?? [];
  assert.ok(marked.length >= 2 && marked.length <= 3, `2–3 suggestions marked (הצעה), got ${marked.length}`);
  assert.deepEqual(everything(store), before, 'Advice is never stored');

  const accepted = claude(cwd, 'כן, תוסיף את הראשונה כנקודה לשיפור', { ...session, resume: true });
  console.log(`accept:\n${accepted}`);
  const { card } = store.readTrainee(id['נועה']);
  assert.equal(card.items.filter((i) => i.kind === 'improve').length, 1, JSON.stringify(card.items));
});

test('an Entry brings fresh, display-safe next-Talk questions for the Trainee it is about', () => {
  const { store, id, cwd } = setUp();
  const reply = claude(cwd, 'דיברתי היום עם דני. הוא מצא לבד את הבאג בפרויקט עם הדפסות, ממש התקדמות. אמא שלו חולה מאוד והוא לא ישן בלילות.');
  console.log(reply);
  const dani = store.readTrainee(id['דני']);
  assert.ok(dani.sensitive.length >= 1, 'the sensitive sentence is cut out');
  const questions = dani.card.nextTalk?.questions ?? [];
  assert.ok(questions.length >= 2 && questions.length <= 3, JSON.stringify(dani.card.nextTalk));
  for (const q of questions) assert.doesNotMatch(q, /אמא|חולה|ישן/, `display-safe: ${q}`);
  assert.equal(store.readTrainee(id['נועה']).card.nextTalk, null, 'only for the Trainee the Entry is about');
});
