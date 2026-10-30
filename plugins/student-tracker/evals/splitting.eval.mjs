// Logging realistic Commander messages: splitting, kinds, dates, the Course preset, Follow-ups,
// corrections, and asking instead of guessing. Runs real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day, today } from './harness.mjs';

useEvalPointer();

// A team of three, by default in week 2 of the Cycle: the Schedule runs only תכנות בסיסי then.
function team({ trainees = ['נועה', 'דני', 'מאיה'], week = 2 } = {}) {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים', start: day(-7 * (week - 1) - 1) }, trainees });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // Every Entry on the team, read through each Trainee.
  const entries = () => {
    const all = store.readTeam().flatMap((t) => store.readTrainee(t.id).entries);
    return [...new Map(all.map((e) => [e.id, e])).values()];
  };
  return { store, id, entries, cwd: workspace() };
}

const lastMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString('sv-SE');
};

test('a team-wide sentence goes to every Trainee, and each Trainee gets only their own sentences, in one Entry', () => {
  const { store, id, entries, cwd } = team();
  const msg = 'כל הצוות היה מעולה היום בפאדנס. נועה הובילה את החלוקה למשימות, ודני קצת נעלם באמצע.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);
  assert.match(reply.trim(), /לביטול: 'בטל'$/);

  assert.deepEqual(entries().map((e) => e.text), [msg], 'one Entry, word-for-word');
  const ev = (name) => store.readTrainee(id[name]).evidence;
  for (const name of ['נועה', 'דני', 'מאיה']) {
    const mine = ev(name);
    assert.ok(mine.some((e) => e.excerpt.includes('כל הצוות היה מעולה היום בפאדנס')), `${name} has the team sentence`);
    assert.ok(mine.every((e) => e.kind === 'project-observation' && e.project === 'padens'), `${name}: Padens observations`);
    assert.ok(mine.every((e) => e.date === today()));
  }
  assert.ok(ev('נועה').some((e) => e.excerpt.includes('נועה הובילה')));
  assert.ok(ev('דני').some((e) => e.excerpt.includes('דני קצת נעלם')));
  assert.ok(!ev('נועה').some((e) => e.excerpt.includes('דני קצת נעלם')), 'Dani\'s sentence is not on Noa');
  assert.ok(!ev('מאיה').some((e) => /נועה הובילה|דני קצת נעלם/.test(e.excerpt)), 'Maya gets only the team sentence');
});

test('Tests resolve by alias and by Schedule, scores only when given, self verdicts kept, relative dates resolved', () => {
  const { store, id, cwd } = team();
  const msg = 'נועה קיבלה 85 בפוב, לדעתה היא לא עברה. דני עבר את תרץ 1 אתמול. ביום שני ישבתי עם מאיה על הפרויקט.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);

  const [noa] = store.readTrainee(id['נועה']).evidence;
  assert.deepEqual([noa.kind, noa.subject, noa.test, noa.score, noa.unlisted], ['test', 'tabi', 'FOV', 85, false]);
  assert.ok(noa.self, 'Noa\'s own verdict is kept on the Test');

  const [dani] = store.readTrainee(id['דני']).evidence;
  assert.deepEqual([dani.kind, dani.test, dani.score, dani.date], ['test', 'BaseCalculator', null, day(-1)], '"תרץ 1" in week 2 is BaseCalculator; no score was given');

  const maya = store.readTrainee(id['מאיה']);
  assert.deepEqual(maya.evidence.map((e) => [e.kind, e.date]), [['talk', lastMonday()]]);
  assert.equal(maya.card.lastTalk, lastMonday());
});

test('an unknown Test is recorded as written and flagged, and joins the Course preset only after the Commander says yes', () => {
  const { store, id, cwd } = team();
  const session = newSession();

  const reply = claude(cwd, 'מאיה עשתה היום את תרץ קרוקודיל, היה לה קשה עם הירושה', session);
  console.log(`reply:\n${reply}`);
  const [ev] = store.readTrainee(id['מאיה']).evidence;
  assert.equal(ev.kind, 'test');
  assert.equal(ev.unlisted, true);
  assert.match(ev.test, /קרוקודיל/);
  assert.ok(!store.readCycle().preset.tests.some((t) => [t.name, ...t.aliases].some((n) => n.includes('קרוקודיל'))), 'not added before a yes');

  const yes = claude(cwd, 'כן, זה תרץ של OOP', { ...session, resume: true });
  console.log(`yes reply:\n${yes}`);
  const added = store.readCycle().preset.tests.find((t) => [t.name, ...t.aliases].some((n) => n.includes('קרוקודיל')));
  assert.ok(added, 'added after the yes');
  assert.equal(added.subject, 'oop');
});

test('an unknown name, or a message that might be a question, records nothing and asks', () => {
  const { entries, cwd } = team();

  const unknown = claude(cwd, 'דיברתי היום עם יואב ועם נועה על הפרויקט');
  console.log(`unknown name reply:\n${unknown}`);
  assert.doesNotMatch(unknown, /לביטול/);

  const question = claude(cwd, 'נועה עברה את פוב?');
  console.log(`question reply:\n${question}`);
  assert.doesNotMatch(question, /לביטול/);

  assert.deepEqual(entries(), [], 'nothing recorded');
});

test('a later update closes an open Follow-up and can open new ones', () => {
  const { store, id, cwd } = team();
  const earlier = 'דיברתי עם נועה על הדיבאג. סיכמנו שתשב עם דני על הדיבאג';
  const { followups: [agreed] } = store.recordEntry({
    text: earlier,
    evidence: [{ trainee: id['נועה'], kind: 'talk', date: day(-3), excerpt: earlier, followups: ['סיכמנו שתשב עם דני על הדיבאג'] }],
  });

  const reply = claude(cwd, 'נועה ישבה עם דני על הדיבאג כמו שסיכמנו, זה עזר לה. לשיחה הבאה עם מאיה: לבדוק אם סיימה לעבור על הסורסים');
  console.log(`reply:\n${reply}`);

  const noa = store.readTrainee(id['נועה']);
  assert.deepEqual(noa.card.followups, [], 'Noa\'s Follow-up is closed');
  assert.ok(noa.evidence.some((e) => e.closes.includes(agreed)));
  assert.equal(store.readTrainee(id['דני']).evidence.length, 0, 'Dani is only mentioned, nothing said about him');
  const maya = store.readTrainee(id['מאיה']);
  assert.equal(maya.card.followups.length, 1);
  assert.match(maya.card.followups[0].text, /לבדוק אם סיימה לעבור על הסורסים/);
});

test('a correction becomes a clarification linked to the original, which is not changed', () => {
  const { store, id, cwd } = team();
  const earlier = 'נועה עברה את פליים בקלות';
  const { evidence: [original] } = store.recordEntry({
    text: earlier,
    evidence: [{ trainee: id['נועה'], kind: 'test', date: day(-1), excerpt: earlier, test: 'Flame' }],
  });

  const reply = claude(cwd, 'טעות שלי, נועה לא עשתה את פליים אלא את פוב');
  console.log(`reply:\n${reply}`);

  const { evidence } = store.readTrainee(id['נועה']);
  assert.equal(evidence.find((e) => e.id === original).test, 'Flame', 'the original stays as written');
  const clar = evidence.filter((e) => e.kind === 'clarification');
  assert.equal(clar.length, 1);
  assert.equal(clar[0].clarifies, original);
});

test('every kind of Evidence is classified, and a code review links its Test', () => {
  const { store, id, cwd } = team();
  const msg = 'נועה סיפרה שלפני הקורס למדה פייתון לבד, והיא רוצה להגיע לפיקוד. בסקד על פליים ראיתי שהיא כותבת קוד מסודר. ברמ"ת היא כתבה שהיא חזקה באלגוריתמיקה. לשפר: לקרוא את כל הדרישה לפני שמתחילים לכתוב. דני עלה היום לרף מקס. מאיה הגיעה באיחור לשיעור הבוקר.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);
  assert.match(reply.trim(), /לביטול: 'בטל'$/);

  const kinds = (name) => new Set(store.readTrainee(id[name]).evidence.map((e) => e.kind));
  for (const kind of ['background', 'goal', 'code-review', 'self-assessment', 'improve-keep']) {
    assert.ok(kinds('נועה').has(kind), `Noa has a ${kind} Evidence`);
  }
  assert.equal(store.readTrainee(id['נועה']).evidence.find((e) => e.kind === 'code-review').test, 'Flame');
  assert.deepEqual([...kinds('דני')], ['evaluation-event']);
  assert.deepEqual([...kinds('מאיה')], ['note']);
});

test('a "תרץ 1" the Schedule leaves ambiguous is asked about, and nothing is recorded', () => {
  // Week 4: תכנות בסיסי and OOP both run, and each has a Test 1.
  const { entries, cwd } = team({ week: 4 });
  const reply = claude(cwd, 'דני עבר היום את תרץ 1');
  console.log(`reply:\n${reply}`);
  assert.doesNotMatch(reply, /לביטול/);
  assert.deepEqual(entries(), []);
});

test('a first name shared by two Trainees is asked about, and nothing is recorded', () => {
  const { entries, cwd } = team({ trainees: ['נועה כ.', 'נועה ל.', 'דני'] });
  const reply = claude(cwd, 'דיברתי היום עם נועה על הפרויקט');
  console.log(`reply:\n${reply}`);
  assert.doesNotMatch(reply, /לביטול/);
  assert.deepEqual(entries(), []);
});
