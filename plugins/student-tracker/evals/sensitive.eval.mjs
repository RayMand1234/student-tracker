// Sensitive details: cut out, kept apart from everything the dashboard reads, flippable on the
// Commander's word, and still readable in chat. Runs real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day, today } from './harness.mjs';

useEvalPointer();

const MARK = '[פרט אישי — בתיק]';

function team(options) {
  const store = freshTestStore(options);
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים', start: day(-8) }, trainees: ['נועה', 'דני', 'מאיה'] });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // Everything the dashboard page may read: the cards, the Cycle, and each Trainee's public records.
  const pageView = () => JSON.stringify(store.readTeam().map((card) => {
    const { evidence, assessments, followups, items, changes } = store.readTrainee(card.id);
    return { card, evidence, assessments, followups, items, changes };
  }).concat(store.readCycle()));
  return { store, id, pageView, cwd: workspace() };
}

const leaks = (text, words) => words.filter((w) => text.includes(w));
// The confirmation lines: one per Trainee ("<name> — …"). Urgent safety advice above them may
// explain itself in the Commander's words; it is private chat, not a record.
const confirmation = (reply, names) => reply.split('\n').filter((l) => names.some((n) => l.startsWith(`${n} —`))).join('\n');

test('a family sentence in a Talk is cut out: kept in the sensitive collection, marked in the public Evidence, never echoed', () => {
  const { store, id, pageView, cwd } = team();
  const msg = 'דיברתי היום עם נועה על הפרויקט, היא מתקדמת יפה בדיבאג. סיפרה לי שאבא שלה מאושפז בבית חולים כבר שבוע. סיכמנו שתעבור על הסקד עד יום ראשון.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);
  assert.match(reply.trim(), /לביטול: 'בטל'$/);
  assert.ok(reply.includes(MARK), 'the reply says what was marked');
  assert.deepEqual(leaks(reply, ['מאושפז', 'בית חולים']), [], 'the reply never repeats the sensitive sentence');

  const noa = store.readTrainee(id['נועה']);
  assert.equal(noa.entries[0].text, msg, 'the raw Entry keeps the whole message');
  const parts = noa.sensitive.filter((s) => s.record === 'evidence');
  assert.ok(parts.some((s) => s.category === 'family' || s.category === 'health'), 'marked family or health');
  assert.ok(parts.some((s) => s.excerpt.includes('מאושפז')), 'the sentence is kept word-for-word');
  const talk = noa.evidence.find((e) => e.kind === 'talk');
  assert.ok(talk.excerpt.includes(MARK) && talk.excerpt.includes('מתקדמת יפה בדיבאג'), 'the public Talk keeps the rest');
  assert.equal(noa.card.lastTalk, today());
  assert.deepEqual(leaks(pageView(), ['מאושפז', 'בית חולים']), [], 'nothing sensitive where the page reads');
});

test('serious distress is marked and the reply suggests involving a professional', () => {
  const { store, id, pageView, cwd } = team();
  const msg = 'דני בא אליי אחרי השיעור ובכה. אמר שהוא לא ישן כבר כמה לילות, שהוא מרגיש שאין לו בשביל מה להמשיך ושהכול קורס עליו. לבדוק איתו מחר בבוקר.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);
  assert.match(reply, /קב"ן/);
  assert.ok(confirmation(reply, ['דני']), 'a confirmation line for Dani');
  assert.deepEqual(leaks(confirmation(reply, ['דני']), ['בכה', 'לא ישן', 'בשביל מה להמשיך']), []);

  const dani = store.readTrainee(id['דני']);
  assert.ok(dani.sensitive.some((s) => s.record === 'evidence' && s.category === 'distress'));
  assert.deepEqual(leaks(pageView(), ['בכה', 'לא ישן', 'בשביל מה להמשיך', 'קורס עליו']), []);
});

test('"זה לא רגיש" unmarks what was just marked, and "זה רגיש" marks a public Evidence, under the same ids', () => {
  const { store, id, pageView, cwd } = team();
  const session = newSession();

  const logged = claude(cwd, 'מאיה סיפרה לי שהיא נפרדה מהחבר שלה, אבל היא מגיעה מרוכזת לשיעורים', session);
  console.log(`logged:\n${logged}`);
  const [part] = store.readTrainee(id['מאיה']).sensitive.filter((s) => s.record === 'evidence');
  assert.ok(part, 'the breakup was marked');

  const unmarked = claude(cwd, 'זה לא רגיש', { ...session, resume: true });
  console.log(`unmarked:\n${unmarked}`);
  const maya = store.readTrainee(id['מאיה']);
  assert.deepEqual(maya.sensitive, []);
  assert.ok(maya.evidence.some((e) => e.id === part.id && e.excerpt === part.excerpt), 'moved out under the same id');

  // Not sensitive by any category, but the Commander's word decides.
  const plain = 'דני ישב היום עם כל הצוות על הבאג ב-DB ועזר לכולם';
  const s2 = newSession();
  claude(cwd, plain, s2);
  const [ev] = store.readTrainee(id['דני']).evidence;
  assert.ok(ev, 'recorded as public Evidence');
  const marked = claude(cwd, 'זה רגיש, תסתיר את זה', { ...s2, resume: true });
  console.log(`marked:\n${marked}`);
  const dani = store.readTrainee(id['דני']);
  assert.ok(dani.sensitive.some((s) => s.id === ev.id && s.record === 'evidence' && s.category), 'moved in under the same id, with a category');
  assert.ok(!dani.evidence.some((e) => e.id === ev.id));
  assert.deepEqual(leaks(pageView(), ['הבאג ב-DB']), [], 'gone from everything the page reads');
});

test('"מה כתבתי על נועה ב-<day>?" quotes the raw Entry, sensitive sentence and all', () => {
  const when = new Date(`${day(-5)}T10:00:00`);
  const { store, id, cwd } = team({ now: () => when });
  const text = 'דיברתי עם נועה. ההורים שלה בהליך גירושין והיא עוברת תקופה קשה. בתרגול היא דווקא מצוינת.';
  store.recordEntry({
    text,
    evidence: [{
      trainee: id['נועה'], kind: 'talk', date: day(-5), excerpt: `דיברתי עם נועה. ${MARK} בתרגול היא דווקא מצוינת.`,
      sensitive: [{ category: 'family', excerpt: 'ההורים שלה בהליך גירושין והיא עוברת תקופה קשה.' }],
    }],
  });

  const [, m, d] = day(-5).split('-');
  const reply = claude(cwd, `מה כתבתי על נועה ב-${d}/${m}?`);
  console.log(`reply:\n${reply}`);
  assert.ok(reply.includes(text), 'the Entry word-for-word');
  assert.doesNotMatch(reply, /לביטול/, 'nothing recorded');
  assert.equal(store.readTrainee(id['נועה']).entries.length, 1);
});
