// Retraction ("בטל"): the last Entry or a named one is withdrawn, kept and flagged; Ratings
// recompute without it, on the shared fixture table; a hard delete waits for the Commander's yes.
// Runs real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day, today } from './harness.mjs';
import { RATING_FIXTURES, TODAY } from '../test/fixtures/ratings.mjs';
import { rating } from '../dashboard/derive.mjs';

useEvalPointer();

// Seeded records are written a second apart, ending well before the agent's own writes.
function team(trainees = ['נועה', 'דני', 'מאיה']) {
  let tick = 0;
  const start = Date.now() - 3_600_000;
  const store = freshTestStore({ now: () => new Date(start + 1000 * tick++) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים', start: day(-30) }, trainees });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  const log = (name, date, text, more = {}) => store.recordEntry({
    text,
    evidence: [{ trainee: id[name], kind: 'talk', date, excerpt: text, ...more }],
  });
  return { store, id, log, cwd: workspace() };
}

test('"בטל" right after an update withdraws that Entry whole: flagged, kept, and the cards are as before', () => {
  const { store, id, log, cwd } = team();
  log('נועה', day(-3), 'דיברתי עם נועה על הפרויקט.');
  const before = store.readTeam();
  const session = newSession();

  const logged = claude(cwd, 'דיברתי היום עם נועה, היא מצאה לבד את הבאג בלולאה. אמא שלה מאושפזת בבית חולים. סיכמנו שתציג לצוות מחר. דני עזר לה עם הבדיקות.', session);
  console.log(`logged:\n${logged}`);
  const entry = store.readTrainee(id['נועה']).entries.at(-1);
  assert.equal(entry.text.startsWith('דיברתי היום עם נועה'), true, 'the update was recorded');

  const reply = claude(cwd, 'בטל', { ...session, resume: true });
  console.log(`reply:\n${reply}`);
  assert.ok(!reply.includes('מאושפזת') && !reply.includes('בבית חולים'), 'no sensitive words in the reply');
  assert.doesNotMatch(reply, /לביטול: 'בטל'/);
  assert.deepEqual(store.readTeam(), before, 'cards as before the update');

  for (const name of ['נועה', 'דני']) {
    const live = store.readTrainee(id[name]);
    assert.ok(live.entries.every((e) => e.id !== entry.id), `${name}: the Entry no longer shows`);
    assert.ok([...live.evidence, ...live.sensitive, ...live.followups, ...live.assessments].every((r) => r.entry !== entry.id), `${name}: nothing of it shows`);
    const all = store.readTrainee(id[name], { retracted: true });
    const cut = [...all.evidence, ...all.sensitive, ...all.followups, ...all.assessments].filter((r) => r.entry === entry.id);
    assert.ok(cut.every((r) => r.retracted === true), `${name}: every record flagged`);
  }
  const kept = store.readTrainee(id['נועה'], { retracted: true });
  assert.ok(kept.sensitive.some((s) => s.entry === entry.id && s.retracted === true), 'the sensitive part is retracted too');
  assert.equal(kept.entries.find((e) => e.id === entry.id).text, entry.text, 'kept word-for-word');
});

test('naming an earlier Entry retracts that one only', () => {
  const { store, id, log, cwd } = team();
  const dani = log('דני', day(-1), 'דיברתי עם דני על הסקד של פוב, הוא לא הבין את ההערות.').entry;
  const noa = log('נועה', day(-1), 'דיברתי עם נועה על הרמ"ת.').entry;
  const later = log('דני', today(), 'דיברתי עם דני שוב, הפעם הוא תיקן הכול.').entry;

  const reply = claude(cwd, 'בטל את השיחה עם דני מאתמול, רשמתי אותה בטעות');
  console.log(`reply:\n${reply}`);
  const withdrawn = store.readTrainee(id['דני'], { retracted: true }).entries.filter((e) => e.retracted !== false).map((e) => e.id);
  assert.deepEqual(withdrawn, [dani]);
  assert.deepEqual(store.readTrainee(id['דני']).entries.map((e) => e.id), [later]);
  assert.deepEqual(store.readTrainee(id['נועה']).entries.map((e) => e.id), [noa]);
  assert.equal(store.readTrainee(id['דני']).card.lastTalk, today());
});

// The shared fixture table: one Trainee per fixture, dates moved so the fixture's today is today;
// then one wrong team-wide Commander Rating, which "בטל" withdraws.
const NAMES = ['אביגיל', 'ברק', 'גלעד', 'דנה', 'הדס', 'ויקטור', 'זיו', 'חנה', 'טליה', 'יעל', 'כרמל', 'ליאור', 'מור', 'נדב', 'סהר', 'עומר', 'פזית', 'צחי'];

test('after "בטל", every Rating is back to what the shared fixture table expects', () => {
  assert.ok(RATING_FIXTURES.length <= NAMES.length);
  const names = NAMES.slice(0, RATING_FIXTURES.length);
  const { store, id, cwd } = team(names);
  const shift = Math.round((Date.parse(today()) - Date.parse(TODAY)) / 86_400_000);
  const moved = (date) => new Date(Date.parse(date) + shift * 86_400_000).toISOString().slice(0, 10);
  RATING_FIXTURES.forEach(({ assessments }, i) => {
    assessments.forEach(([date, score, author], j) => {
      const text = `הערה ${j + 1} על ${names[i]}`;
      store.recordEntry({
        text,
        evidence: [{ trainee: id[names[i]], kind: author === 'trainee' ? 'self-assessment' : 'note', date: moved(date), excerpt: text }],
        assessments: [{ trainee: id[names[i]], skill: 'impl.debugging', score, author, reason: 'סיבה', evidence: ['#1'] }],
      });
    });
  });
  const wrong = 'הדיבאג של כל הצוות זה 1';
  const { entry } = store.recordEntry({
    text: wrong,
    evidence: names.map((n) => ({ trainee: id[n], kind: 'note', date: today(), excerpt: wrong })),
    assessments: names.map((n, i) => ({ trainee: id[n], skill: 'impl.debugging', score: 1, author: 'commander', reason: 'המפקד: 1', evidence: [`#${i + 1}`] })),
  });

  const reply = claude(cwd, 'בטל');
  console.log(`reply:\n${reply}`);
  assert.ok(store.readTrainee(id[names[0]], { retracted: true }).entries.find((e) => e.id === entry).retracted.at, 'the last Entry was retracted');
  RATING_FIXTURES.forEach(({ name, expect }, i) => {
    const r = rating(store.readTrainee(id[names[i]]).card.skills['impl.debugging'], today());
    assert.deepEqual(r && { score: r.score, author: r.author, trend: r.trend, stale: r.stale }, expect, name);
  });
});

test('a hard delete is asked for explicitly and runs only after the Commander says yes', () => {
  const { store, id, log, cwd } = team();
  const keep = log('נועה', day(-2), 'דיברתי עם נועה על התרץ.').entry;
  const gone = log('נועה', today(), 'דיברתי עם נועה על החופשה שלה.').entry;
  const session = newSession();

  const ask = claude(cwd, 'תמחק לגמרי את הרישום האחרון על נועה, שלא יישאר ממנו כלום', session);
  console.log(`ask:\n${ask}`);
  assert.deepEqual(store.readTrainee(id['נועה'], { retracted: true }).entries.map((e) => e.id).sort(), [keep, gone].sort(), 'nothing deleted before the yes');

  const done = claude(cwd, 'כן', { ...session, resume: true });
  console.log(`done:\n${done}`);
  const all = store.readTrainee(id['נועה'], { retracted: true });
  assert.deepEqual(all.entries.map((e) => e.id), [keep]);
  assert.ok(all.evidence.every((e) => e.entry === keep));
  assert.equal(all.card.lastTalk, day(-2));
});
