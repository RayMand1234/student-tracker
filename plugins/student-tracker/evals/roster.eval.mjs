// Roster, settings and course changes: confirmed before they apply, and nothing written on a no.
// Runs real model calls on your credential: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, day, today } from './harness.mjs';

useEvalPointer();

function setUp(trainees = ['נועה', 'דני']) {
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // Everything a roster or settings change can touch, plus every Trainee's records.
  const state = () => ({
    cycle: store.readCycle(),
    trainees: store.readTeam().map((t) => store.readTrainee(t.id)),
  });
  return { store, id, state, cwd: workspace() };
}

// The request alone changes nothing; "לא" changes nothing; in a fresh session the same request
// and "כן" apply it. Returns the confirming session, for follow-up turns.
function confirmOrDecline(request, applied, trainees) {
  const declined = setUp(trainees);
  const before = declined.state();
  const no = newSession();
  console.log(`ask:\n${claude(declined.cwd, request, no)}`);
  assert.deepEqual(declined.state(), before, 'nothing changes before the Commander confirms');
  console.log(`decline:\n${claude(declined.cwd, 'לא', { ...no, resume: true })}`);
  assert.deepEqual(declined.state(), before, 'nothing changes on a no');

  const confirmed = setUp(trainees);
  const yes = newSession();
  const asked = confirmed.state();
  console.log(`ask:\n${claude(confirmed.cwd, request, yes)}`);
  assert.deepEqual(confirmed.state(), asked, 'nothing changes before the Commander confirms');
  console.log(`confirm:\n${claude(confirmed.cwd, 'כן', { ...yes, resume: true })}`);
  applied(confirmed);
  return confirmed;
}

test('adding a Trainee', () => {
  confirmOrDecline('תוסיף לצוות חניכה חדשה בשם מאיה', ({ store }) => {
    const maya = store.readTeam().find((t) => t.name === 'מאיה');
    assert.ok(maya, 'מאיה is on the team');
    assert.equal(maya.active, true);
  });
});

test('a second Noa: both get a label, and a bare "נועה" then asks which one', () => {
  const { store, cwd } = confirmOrDecline(
    'תוסיף חניכה חדשה, נועה לוי. לנועה שכבר בצוות קוראים נועה כהן.',
    ({ store }) => {
      const noas = store.readTeam().filter((t) => t.name.startsWith('נועה'));
      assert.equal(noas.length, 2);
      assert.ok(noas.every((t) => t.name !== 'נועה'), `both labelled: ${noas.map((t) => t.name)}`);
    },
  );
  const before = store.readTeam().map((t) => store.readTrainee(t.id).evidence.length);
  console.log(`bare name:\n${claude(cwd, 'דיברתי היום עם נועה על הפרויקט')}`);
  assert.deepEqual(store.readTeam().map((t) => store.readTrainee(t.id).evidence.length), before, 'nothing recorded until it is clear which Noa');
});

test('a Trainee leaving: out of the team, records kept, new Evidence only if the Commander insists', () => {
  const { store, id, cwd } = confirmOrDecline('דני עזב אתמול, הוא עבר לקורס אחר', ({ store, id }) => {
    const dani = store.readTrainee(id['דני']).card;
    assert.equal(dani.active, false);
    assert.equal(dani.left.date, day(-1));
    assert.equal(dani.left.how, 'transfer');
  });
  const session = newSession();
  console.log(`update about him:\n${claude(cwd, 'דיברתי היום עם דני בטלפון, הוא מסתדר בקורס החדש', session)}`);
  assert.equal(store.readTrainee(id['דני']).evidence.length, 0, 'not recorded without the Commander insisting');
  console.log(`insist:\n${claude(cwd, 'כן, תרשום', { ...session, resume: true })}`);
  const dani = store.readTrainee(id['דני']);
  assert.equal(dani.evidence.length, 1);
  assert.equal(dani.card.active, false, 'still left');
});

test('changing the Talk target', () => {
  confirmOrDecline('שנה יעד שיחות ל-7 ימים', ({ store }) => {
    assert.deepEqual(store.readCycle().commander.settings.talk, { target: 7, yellow: 10, red: 14 });
  });
});

test('changing the Commander role', () => {
  confirmOrDecline('תעדכן שהתפקיד שלי הוא מפ"צ', ({ store }) => {
    assert.match(store.readCycle().commander.settings.role, /מפ"צ/);
  });
});

test('a Course preset edit: an alias for a Test', () => {
  confirmOrDecline('תוסיף לתרץ FOV את הכינוי פובי', ({ store }) => {
    assert.ok(store.readCycle().preset.tests.find((t) => t.name === 'FOV').aliases.includes('פובי'));
  });
});

test('a Project team, and a project observation then links to it', () => {
  const { store, id, cwd } = confirmOrDecline('בפאדנס נועה ודני עובדים בצוות אחד', ({ store, id }) => {
    const { teams } = store.readCycle();
    assert.equal(teams.length, 1);
    assert.equal(teams[0].project, 'padens');
    assert.deepEqual([...teams[0].members].sort(), [id['נועה'], id['דני']].sort());
  });
  console.log(`observation:\n${claude(cwd, 'בפאדנס היום נועה חילקה את המשימות בצוות בצורה מעולה')}`);
  const obs = store.readTrainee(id['נועה']).evidence.find((e) => e.kind === 'project-observation');
  assert.ok(obs, 'a project observation for Noa');
  assert.equal(obs.team, store.readCycle().teams[0].id);
});

test('adding a Skill to a Stage', () => {
  confirmOrDecline('תוסיף מיומנות "ניהול זמן" לשלב מימוש בקוד', ({ store }) => {
    const impl = store.readCycle().skills.groups.find((g) => g.id === 'impl').skills;
    const added = impl.find((s) => s.name === 'ניהול זמן');
    assert.ok(added, 'ניהול זמן is in מימוש בקוד');
    assert.match(added.id, /^impl\.c-/);
  });
});

test('archiving a Skill', () => {
  confirmOrDecline('תעביר לארכיון את המיומנות חיפוש באינטרנט, אנחנו לא בודקים אותה', ({ store }) => {
    const skill = store.readCycle().skills.groups.flatMap((g) => g.skills).find((s) => s.id === 'impl.web-search');
    assert.equal(skill.archived, true, 'archived, not deleted');
  });
});

// Two earlier notes on the same theme (time management), which no Skill covers; the third comes in chat.
function recurringTheme() {
  const setup = setUp();
  const noa = setup.id['נועה'];
  for (const [i, text] of ['נועה לא הספיקה לסיים את התרגיל בזמן, נתקעה על העיצוב.', 'שוב נועה לא סיימה בזמן, ביזבזה שעה על שמות משתנים.'].entries()) {
    setup.store.recordEntry({ text, evidence: [{ trainee: noa, kind: 'note', date: day(-7 + i), excerpt: text }] });
  }
  return { ...setup, noa, third: 'גם היום נועה לא הספיקה לסיים את התרגיל בזמן, היא לא מנהלת את הזמן שלה' };
}

test('a theme recurring a third time with no Skill brings a proposal, added only on a yes', () => {
  const { store, noa, cwd, third } = recurringTheme();
  const skillsBefore = store.readCycle().skills;
  const session = newSession();
  const reply = claude(cwd, third, session);
  console.log(`third time:\n${reply}`);
  assert.match(reply, /\(הצעה\)/);
  assert.deepEqual(store.readCycle().skills, skillsBefore, 'no Skill added without a yes');
  console.log(`yes:\n${claude(cwd, 'כן', { ...session, resume: true })}`);
  const added = store.readCycle().skills.groups.flatMap((g) => g.skills).filter((s) => s.added);
  assert.equal(added.length, 1);
  assert.match(added[0].name, /זמן/);
  assert.equal(store.readTrainee(noa).evidence.filter((e) => e.date === today()).length, 1, 'the update itself was recorded');
});

test('a declined Skill proposal adds nothing', () => {
  const { store, cwd, third } = recurringTheme();
  const skillsBefore = store.readCycle().skills;
  const session = newSession();
  console.log(`third time:\n${claude(cwd, third, session)}`);
  console.log(`no:\n${claude(cwd, 'לא', { ...session, resume: true })}`);
  assert.deepEqual(store.readCycle().skills, skillsBefore);
});
