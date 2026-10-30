// Assessments and Ratings: what the agent writes per update, the Commander's own Assessments
// and proposals against them, self-assessment gaps, re-rating, corrections, and the Rating rule read
// back off the shared fixture table. Runs real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day, today } from './harness.mjs';
import { RATING_FIXTURES, TODAY } from '../test/fixtures/ratings.mjs';

useEvalPointer();

// Seeded records are written a second apart, ending well before the agent's own writes.
function team(trainees = ['נועה', 'דני', 'מאיה']) {
  let tick = 0;
  const start = Date.now() - 3_600_000;
  const store = freshTestStore({ now: () => new Date(start + 1000 * tick++) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים', start: day(-30) }, trainees });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // A note on `date`, with an Assessment citing it when `skill` is given. Returns the note's id.
  const seed = (name, date, text, assessment) => {
    const { evidence: [ev] } = store.recordEntry({
      text,
      evidence: [{ trainee: id[name], kind: assessment?.author === 'trainee' ? 'self-assessment' : 'note', date, excerpt: text }],
      assessments: assessment ? [{ trainee: id[name], reason: 'סיבה', evidence: ['#1'], ...assessment }] : [],
    });
    return ev;
  };
  return { store, id, seed, cwd: workspace() };
}

const ofSkill = (assessments, skill) => assessments.filter((a) => a.skill === skill);

test('an update yields agent Assessments only on the Skills it speaks to, citing its Evidence, listed on the reply', () => {
  const { store, id, cwd } = team();
  const msg = 'דיברתי היום עם דני, הוא מצא לבד את הבאג בפונקציית המיון אחרי שהוסיף הדפסות ובדק כל שלב.';

  const reply = claude(cwd, msg);
  console.log(`reply:\n${reply}`);
  assert.match(reply.trim(), /לביטול: 'בטל'$/);
  assert.match(reply, /\(הערכה\)/);
  assert.match(reply, /—→\d/, 'a first Rating shows as —→N');

  const { evidence: [talk], assessments, card } = store.readTrainee(id['דני']);
  assert.ok(ofSkill(assessments, 'impl.debugging').length === 1, 'debugging assessed');
  assert.ok(assessments.length <= 4, `no sweep of all Skills: ${assessments.map((a) => a.skill)}`);
  for (const a of assessments) {
    assert.equal(a.author, 'agent');
    assert.ok(Number.isInteger(a.score) && a.score >= 1 && a.score <= 5);
    assert.ok(a.reason.trim());
    assert.ok(a.evidence.includes(talk.id), `${a.skill} cites the Talk`);
  }
  assert.ok(card.skills['impl.debugging'].a.length === 1);
  assert.deepEqual(store.readTrainee(id['נועה']).assessments, [], 'nobody else assessed');
});

test('test scores alone produce no Assessment', () => {
  const { store, id, cwd } = team();
  const reply = claude(cwd, 'דני קיבל 85 בפוב ונועה עברה את פליים.');
  console.log(`reply:\n${reply}`);
  for (const name of ['דני', 'נועה']) {
    const { evidence, assessments } = store.readTrainee(id[name]);
    assert.ok(evidence.some((e) => e.kind === 'test'), `${name}: the test is recorded`);
    assert.deepEqual(assessments, [], `${name}: no Assessment`);
  }
});

test('the Commander\'s own Assessment is a note plus a Commander Assessment that stays the Rating; a differing agent judgment is a proposal the Commander can accept', () => {
  const { store, id, cwd } = team();
  const session = newSession();
  const maya = () => store.readTrainee(id['מאיה']);

  const set = claude(cwd, 'הדיבאג של מאיה זה 4', session);
  console.log(`set:\n${set}`);
  const [note] = maya().evidence;
  assert.equal(note.kind, 'note');
  const [byCommander] = ofSkill(maya().assessments, 'impl.debugging');
  assert.deepEqual([byCommander.author, byCommander.score], ['commander', 4]);
  assert.ok(byCommander.evidence.includes(note.id), 'rests on the note');
  assert.equal(ofSkill(maya().assessments, 'impl.debugging').length, 1, 'no agent Assessment beside it');

  const talk = claude(cwd, 'דיברתי עם מאיה, היא נתקעה כל היום על באג פשוט ולא הצליחה להתקדם עד שישבתי איתה צעד אחרי צעד.', { ...session, resume: true });
  console.log(`talk:\n${talk}`);
  const proposal = ofSkill(maya().assessments, 'impl.debugging').find((a) => a.author === 'agent');
  assert.ok(proposal, 'the agent judgment is kept');
  assert.ok(proposal.score <= 3, `judged lower than 4: ${proposal.score}`);
  assert.deepEqual(maya().card.skills['impl.debugging'].a.at(-1), [byCommander.date, 4, 'commander'], 'the Commander-set Rating still counts');
  assert.match(talk, /\(הצעה\)/);

  const accepted = claude(cwd, 'כן, תעדכן', { ...session, resume: true });
  console.log(`accepted:\n${accepted}`);
  const latest = ofSkill(maya().assessments, 'impl.debugging').filter((a) => a.author === 'commander').sort((a, b) => (a.at < b.at ? -1 : 1)).at(-1);
  assert.notEqual(latest.id, byCommander.id, 'a new Commander Assessment');
  assert.equal(latest.score, proposal.score);
  assert.equal(maya().card.skills['impl.debugging'].a.at(-1)[1], proposal.score);
});

test('a רמ"ת: the Trainee\'s own scores never count, and a gap of 2+ yields an agent Assessment on self-awareness', () => {
  const { store, id, seed, cwd } = team();
  seed('נועה', day(-7), 'נועה מתקשה מאוד בדיבאג, צריכה ליווי צמוד בכל באג', { skill: 'impl.debugging', score: 2, author: 'agent' });
  seed('נועה', day(-7), 'נועה עובדת סביר בצוות, לפעמים נסגרת', { skill: 'inter.teamwork', score: 3, author: 'agent' });

  const reply = claude(cwd, 'נועה מילאה היום רמ"ת. ציונים שנתנה לעצמה: יכולות דיבאג 5, עבודת צוות 3.');
  console.log(`reply:\n${reply}`);
  const { evidence, assessments, card } = store.readTrainee(id['נועה']);
  const form = evidence.find((e) => e.kind === 'self-assessment');
  assert.ok(form, 'the form is a self-assessment Evidence');
  const own = assessments.filter((a) => a.author === 'trainee');
  assert.deepEqual(own.map((a) => [a.skill, a.score]).sort(), [['impl.debugging', 5], ['inter.teamwork', 3]]);
  assert.ok(own.every((a) => a.evidence.includes(form.id)));
  assert.ok(!card.skills['impl.debugging'].a.some(([, , author]) => author === 'trainee'), 'never on the card');

  const aware = ofSkill(assessments, 'learn.self-awareness');
  assert.equal(aware.length, 1, 'one self-awareness Assessment');
  assert.equal(aware[0].author, 'agent');
  assert.ok(aware[0].evidence.includes(form.id), 'cites the form');
});

test('"תדרג מחדש" writes standalone Assessments only where the judgment changed', () => {
  const { store, id, seed, cwd } = team();
  seed('נועה', day(-30), 'נועה נתקעת על כל באג ומחכה שיעזרו לה', { skill: 'impl.debugging', score: 2, author: 'agent' });
  seed('נועה', day(-10), 'נועה מצאה לבד באג מסובך ב-DB עם הדיבאגר, בלי לבקש עזרה');
  seed('נועה', day(-3), 'נועה עזרה לדני ולמאיה לדבאג את הקוד שלהם והסבירה להם איך להשתמש בברייקפוינטים');
  seed('נועה', day(-5), 'נועה עבדה מצוין בצוות בפאדנס, חילקה משימות והקשיבה לכולם', { skill: 'inter.teamwork', score: 4, author: 'agent' });
  const before = store.readTrainee(id['נועה']);

  const reply = claude(cwd, 'תדרג מחדש את נועה');
  console.log(`reply:\n${reply}`);
  const after = store.readTrainee(id['נועה']);
  const fresh = after.assessments.filter((a) => !before.assessments.some((b) => b.id === a.id));
  const debugging = ofSkill(fresh, 'impl.debugging');
  assert.equal(debugging.length, 1, 'debugging re-assessed');
  assert.ok(debugging[0].score >= 3, `judged higher than 2: ${debugging[0].score}`);
  for (const a of fresh) {
    assert.match(a.id, /^a-\d{8}-\d{4}-[a-z0-9]{2}$/);
    assert.equal(a.entry, null);
  }
  assert.deepEqual(ofSkill(fresh, 'inter.teamwork'), [], 'teamwork unchanged: nothing written');
  assert.equal(after.entries.length, before.entries.length, 'no Entry');
});

test('a correction re-assesses the Skills the corrected Evidence backed', () => {
  const { store, id, seed, cwd } = team();
  const talk = seed('נועה', day(-2), 'נועה פתרה לבד את הבאג בלולאה, בלי שום עזרה', { skill: 'impl.debugging', score: 4, author: 'agent' });

  const reply = claude(cwd, 'תיקון לגבי נועה: היא לא פתרה את הבאג בלולאה לבד, דני ישב איתה כל הזמן והראה לה איפה לחפש.');
  console.log(`reply:\n${reply}`);
  const { evidence, assessments } = store.readTrainee(id['נועה']);
  const fix = evidence.find((e) => e.kind === 'clarification');
  assert.equal(fix?.clarifies, talk);
  const redone = ofSkill(assessments, 'impl.debugging').filter((a) => a.evidence.includes(fix.id));
  assert.equal(redone.length, 1, 'debugging re-assessed, citing the clarification');
  assert.ok(redone[0].score <= 3, `lower than 4 now: ${redone[0].score}`);
});

// The shared fixture table: one Trainee per fixture, dates moved so the fixture's today is today.
const NAMES = ['אביגיל', 'ברק', 'גלעד', 'דנה', 'הדס', 'ויקטור', 'זיו', 'חנה', 'טליה', 'יעל', 'כרמל', 'ליאור', 'מור', 'נדב', 'סהר', 'עומר', 'פזית', 'צחי'];

test('the agent reads Rating, Trend and stale off the cards as the shared fixture table expects', () => {
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

  const reply = claude(cwd, 'מה הדירוג של כל אחד מהחניכים ביכולות דיבאג? שורה אחת לכל חניך, בלי תאריכים: "<שם>: <דירוג או ללא דירוג> <↑ או ↓ אם יש מגמה> <(ישן) אם הדירוג ישן>".');
  console.log(`reply:\n${reply}`);
  const lines = reply.split('\n').map((l) => l.replace(/[*_`]/g, '').replace(/^\s*[-•]\s*/, '').trim());
  RATING_FIXTURES.forEach(({ name, expect }, i) => {
    const line = lines.find((l) => l.startsWith(`${names[i]}:`) || l.startsWith(`${names[i]} `));
    assert.ok(line, `a line for ${names[i]} (${name})`);
    const score = line.match(/(?<!\d)([1-5])(?!\d)/)?.[1];
    const trend = line.includes('↑') ? 1 : line.includes('↓') ? -1 : null;
    const got = { score: score ? Number(score) : null, trend, stale: line.includes('ישן') };
    const want = expect
      ? { score: expect.score, trend: expect.trend || null, stale: expect.stale }
      : { score: null, trend: null, stale: false };
    assert.deepEqual(got, want, `${name}: "${line}"`);
  });
});
