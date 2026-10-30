// The full setup conversation on the local backend: one batched question, partial answers,
// Course preset differences, setup-time Trainee info as an ordinary Entry, labels for namesakes,
// nothing created before the yes, and re-running setup over a done or interrupted Cycle.
// Runs real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, DATA, POINTER } from './harness.mjs';

useEvalPointer();

const MARK = '[פרט אישי — בתיק]';
const nothingCreated = (store) => assert.throws(() => store.connect(), /עוד לא הוקם מעקב/, 'nothing is created before the Commander confirms');
const localStores = () => fs.readdirSync(path.join(DATA, 'local'));
// One Commander session: each call is the next turn, logged with its reply.
function conversation(cwd) {
  const session = newSession();
  let turns = 0;
  return (prompt) => {
    const reply = claude(cwd, prompt, { ...session, resume: turns++ > 0 });
    console.log(`> ${prompt}\n${reply}\n`);
    return reply;
  };
}
const losePointer = () => fs.writeFileSync(POINTER, JSON.stringify({ backend: 'local', current: null, archived: [] }));

test('one batched question, a missing Cycle asked for alone, then course changes, settings and Trainee info applied on yes', () => {
  const cwd = workspace();
  const store = freshTestStore();
  const turn = conversation(cwd);

  const question = turn('/student-tracker:setup');
  assert.match(question, /תואם לקורס שלך\?/);
  assert.match(question, /Interpreter/, 'the preset summary names the Projects');
  assert.match(question, /21/, 'and the course length');
  assert.match(question, /14/, 'defaults are shown inline');
  nothingCreated(store);

  const answer = 'אני רז, מפ"צ. שיחה עם כל חניך כל שבוע. החניכים: נועה, דני ומאיה. נועה הגיעה ממדעי המחשב ורוצה להיות מפקדת. '
    + 'דני סיפר לי שאבא שלו מאושפז בבית חולים כבר שבועיים. אצלנו אין את Atom, והקורס 20 שבועות.';
  const askCycle = turn(answer);
  assert.match(askCycle, /מחזור/, 'asks for the missing Cycle');
  assert.doesNotMatch(askCycle, /לאשר\?/, 'no summary while a mandatory answer is missing');
  nothingCreated(store);

  const summary = turn('הצהובים');
  assert.match(summary, /זה מה שאקים — לאשר\?/);
  assert.match(summary, /Atom/, 'the summary lists the course changes');
  assert.match(summary, /20/);
  assert.match(summary, /רז/);
  nothingCreated(store);

  const handOff = turn('כן');
  for (const phrase of ['דיברתי היום עם', 'תכין לי שיחה עם', 'מה המצב', '/plugin']) assert.ok(handOff.includes(phrase), `hand-off has "${phrase}"`);
  assert.match(handOff, /Atom/, 'the hand-off echoes the course changes');

  const { cycle, commander, preset } = store.readCycle();
  assert.equal(cycle.setup, 'done');
  assert.match(cycle.name, /צהוב/);
  assert.equal(commander.settings.name, 'רז');
  assert.match(commander.settings.role, /מפ"צ/);
  assert.equal(commander.settings.talk.target, 7);
  assert.equal(preset.tests.some((t) => t.name === 'Atom'), false, 'Atom is out of this Cycle\'s copy');
  assert.equal(preset.schedule.length, 20);

  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  assert.deepEqual(Object.keys(id).sort(), ['דני', 'מאיה', 'נועה']);

  const noa = store.readTrainee(id['נועה']);
  assert.equal(noa.entries.length, 1, 'the Trainee info is one Entry');
  assert.equal(noa.entries[0].text, answer, 'kept word-for-word: the Commander\'s whole answer');
  assert.ok(noa.evidence.some((e) => e.excerpt.includes('מדעי המחשב')), 'Noa\'s background is Evidence');
  assert.ok(noa.evidence.every((e) => !e.excerpt.includes('דני')), 'Dani\'s info is not Noa\'s Evidence');

  const dani = store.readTrainee(id['דני']);
  assert.ok(dani.sensitive.some((s) => s.excerpt.includes('מאושפז')), 'the hospital sentence is a sensitive record');
  assert.ok(dani.evidence.every((e) => !e.excerpt.includes('מאושפז')), 'and never in the public Evidence');
  assert.ok(dani.evidence.some((e) => e.excerpt.includes(MARK)), 'which keeps the marker in its place');
  assert.equal(store.readTrainee(id['מאיה']).evidence.length, 0, 'nothing invented for Maya');
});

test('two Trainees with one first name get labels before anything is created', () => {
  const cwd = workspace();
  const store = freshTestStore();
  const turn = conversation(cwd);

  const ask = turn('/student-tracker:setup אני רז, מחזור הצהובים, החניכים: נועה, נועה ודני');
  assert.match(ask, /נועה/);
  assert.match(ask, /\?/);
  nothingCreated(store);

  const summary = turn('נועה כ. ונועה ל.');
  assert.match(summary, /לאשר\?/);
  nothingCreated(store);

  turn('כן');
  const names = store.readTeam().map((t) => t.name).sort();
  assert.equal(names.length, 3);
  assert.ok(names.includes('דני'));
  const noas = names.filter((n) => n.startsWith('נועה'));
  assert.equal(noas.length, 2);
  assert.ok(noas.every((n) => n !== 'נועה'), `both carry a label: ${noas}`);
  assert.equal(store.readCycle().cycle.setup, 'done');
});

test('a done Cycle found with the pointer lost: connect or new; connecting writes the pointer and creates nothing', () => {
  const cwd = workspace();
  const store = freshTestStore();
  const { url } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה'] });
  store.finishSetup();
  losePointer();
  const session = newSession();

  const ask = claude(cwd, '/student-tracker:setup', session);
  console.log(`ask:\n${ask}`);
  assert.match(ask, /להתחבר למחזור הצהובים/);
  assert.match(ask, /מחזור חדש/);

  const reply = claude(cwd, 'להתחבר', { ...session, resume: true });
  console.log(`connect:\n${reply}`);
  assert.equal(JSON.parse(fs.readFileSync(POINTER, 'utf8')).current, url);
  assert.equal(localStores().length, 1, 'no second store');
  assert.doesNotMatch(reply, /לאשר\?/);
});

test('an interrupted setup is resumed into the same store: the summary is shown again from what is stored', () => {
  const cwd = workspace();
  const store = freshTestStore();
  const { url } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const session = newSession();

  const summary = claude(cwd, '/student-tracker:setup', session);
  console.log(`summary:\n${summary}`);
  assert.match(summary, /לאשר\?/);
  for (const word of ['הצהובים', 'נועה', 'דני']) assert.ok(summary.includes(word), `the summary shows "${word}" from the store`);
  assert.equal(store.connect().setup, 'in-progress', 'still waiting for the yes');

  claude(cwd, 'כן', { ...session, resume: true });
  assert.deepEqual(store.connect(), { backend: 'local', url, cycle: 'הצהובים', setup: 'done' });
  assert.deepEqual(store.readTeam().map((t) => t.name).sort(), ['דני', 'נועה']);
  assert.equal(localStores().length, 1, 'never a second store');
});
