// Briefs, team status and proactive alerts (ticket 25): the shortcut skills hand off to tracker,
// the brief refreshes and stores the dashboard's next-Talk questions, team status lists who needs
// a Talk, and an overdue Talk rides once a day on another reply. Real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day } from './harness.mjs';

useEvalPointer();

const OLD_QUESTIONS = ['איך הולך עם התרגילים?', 'מה הכי קשה לך עכשיו?'];
const FOLLOW_UP = 'סיכמנו שתשב עם דני על הדיבאג';

// Noa: a Talk 9 days ago with a Follow-up, then a good Test; a family matter in between.
// Dani talked 3 days ago; Or is 22 days past his last Talk (red by the default 10 / 14).
function setUp() {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים', start: day(-50) }, trainees: ['נועה', 'דני', 'אור'] });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  const noa = id['נועה'];
  const talk = `דיברתי עם נועה, היא נתקעת בדיבאג ומחכה שיעזרו לה. ${FOLLOW_UP}.`;
  store.recordEntry({
    text: talk,
    evidence: [{ trainee: noa, kind: 'talk', date: day(-9), excerpt: talk, topics: ['דיבאג'], followups: [FOLLOW_UP] }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 2, author: 'agent', reason: 'מחכה לעזרה בבאגים', evidence: ['#1'] }],
    changes: [{ type: 'nextTalk', trainee: noa, questions: OLD_QUESTIONS }],
  });
  const family = 'נועה סיפרה שאמא שלה מאושפזת בבית חולים השבוע.';
  store.recordEntry({
    text: family,
    evidence: [{ trainee: noa, kind: 'note', date: day(-5), excerpt: '[פרט אישי — בתיק]', sensitive: [{ category: 'family', excerpt: family }] }],
  });
  const test = 'נועה קיבלה 85 בפוב, ומצאה לבד את הבאג בלולאה עם הדפסות.';
  store.recordEntry({
    text: test,
    evidence: [{ trainee: noa, kind: 'test', date: day(-2), excerpt: test, test: 'FOV', score: 85 }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'מצאה לבד באג עם הדפסות', evidence: ['#1'] }],
  });
  for (const [name, ago] of [['דני', -3], ['אור', -22]]) {
    const text = `דיברתי עם ${name} על הפרויקט.`;
    store.recordEntry({ text, evidence: [{ trainee: id[name], kind: 'talk', date: day(ago), excerpt: text }] });
  }
  return { store, id, cwd: workspace() };
}

const entries = (store, tid) => store.readTrainee(tid, { retracted: true }).entries.length;

test('/student-tracker:brief gives the brief in order and stores the opening questions the dashboard shows', () => {
  const { store, id, cwd } = setUp();
  const noa = id['נועה'];
  const before = entries(store, noa);
  const reply = claude(cwd, '/student-tracker:brief נועה');
  console.log(`brief:\n${reply}`);
  const at = (s) => reply.indexOf(s);
  for (const s of ['מה השתנה', 'לבדוק', 'מיקוד (הצעה)', 'שאלות פתיחה']) assert.ok(at(s) !== -1, `has "${s}"`);
  assert.ok(at('מה השתנה') < at('לבדוק') && at('לבדוק') < at('מיקוד (הצעה)') && at('מיקוד (הצעה)') < at('שאלות פתיחה'), 'sections in order');
  assert.ok(reply.includes(FOLLOW_UP), 'the open Follow-up word-for-word');
  const { card } = store.readTrainee(noa);
  const questions = card.nextTalk.questions;
  assert.notDeepEqual(questions, OLD_QUESTIONS, 'refreshed');
  for (const q of questions) assert.ok(reply.includes(q), `the dashboard's question is in the brief: ${q}`);
  for (const q of questions) assert.doesNotMatch(q, /אמא|מאושפזת|בית חולים/, 'display-safe');
  assert.equal(entries(store, noa), before, 'a brief records no Entry');
  assert.doesNotMatch(reply, /⚠/, 'no alert line on a brief');
  assert.doesNotMatch(reply, /\*\*|^#/m, 'plain lines, as the sample');
});

test('"מה המצב עם דני?" is a brief on Dani, not team status', () => {
  const { store, id, cwd } = setUp();
  const reply = claude(cwd, 'מה המצב עם דני?');
  console.log(`dani:\n${reply}`);
  assert.match(reply, /שאלות פתיחה/);
  assert.doesNotMatch(reply, /צריכים שיחה/);
  assert.equal(store.readTrainee(id['דני']).card.nextTalk?.questions.length > 1, true, 'its questions stored');
});

test('/student-tracker:status lists who needs a Talk with its colour and one team action', () => {
  const { store, cwd } = setUp();
  const reply = claude(cwd, '/student-tracker:status');
  console.log(`status:\n${reply}`);
  assert.match(reply, /שבוע 8/);
  const need = reply.slice(reply.indexOf('צריכים שיחה'));
  assert.ok(reply.includes('צריכים שיחה'), 'has the list');
  assert.match(need.split('\n\n')[0], /אור.*22.*\(אדום\)/);
  assert.doesNotMatch(need.split('\n\n')[0], /נועה|דני/, 'only who is overdue');
  assert.match(reply, /פעולה לצוות \(הצעה\)/, 'always one team action');
  assert.doesNotMatch(reply, /\*\*|^#/m, 'plain lines, as the sample');
  // Team status does not count as showing the alert: the first reply after it still carries it.
  assert.equal(store.takeAlert().alert?.name, 'אור');
});

test('an overdue Talk rides on another reply, before the Retraction line, once a day', () => {
  const { cwd } = setUp();
  const session = newSession();
  const first = claude(cwd, 'דני קיבל 90 בפוב', session);
  console.log(`first:\n${first}`);
  const lines = first.trim().split('\n');
  const alert = lines.findIndex((l) => l.includes('⚠'));
  assert.ok(alert !== -1 && /אור/.test(lines[alert]), 'the alert names Or');
  assert.equal(lines.at(-1).trim(), "לביטול: 'בטל'");
  assert.equal(alert, lines.length - 2, 'just before the Retraction line');

  const second = claude(cwd, 'נועה הגישה את התרגיל בזמן', { ...session, resume: true });
  console.log(`second:\n${second}`);
  assert.doesNotMatch(second, /⚠[^\n]*אור/, 'not again today');
});
