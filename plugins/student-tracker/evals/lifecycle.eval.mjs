// Cycle lifecycle on the local backend: a new Cycle from setup carries the Commander's settings,
// Playbook items and hides over and archives the previous Cycle; a setup interrupted between
// creating the new Cycle and archiving the old one is finished on the next run; an archived
// Cycle is read in chat and never written to. Real model calls: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useEvalPointer, freshTestStore, workspace, claude, newSession, today, DATA, POINTER } from './harness.mjs';
import { openStore } from '../lib/store.mjs';

useEvalPointer();

const TIP = 'לבקש מהחניך להסביר לי את הקוד בקול לפני שאני מסתכל עליו';
const pointer = () => JSON.parse(fs.readFileSync(POINTER, 'utf8'));
const stores = () => fs.readdirSync(path.join(DATA, 'local'));
const archivedStore = (url) => openStore({ dataDir: DATA, cycle: url });

// A finished Cycle whose Commander has their own scope, and a Talk with Dani.
function previousCycle() {
  const store = freshTestStore();
  const { url } = store.createCycle({
    commander: { name: 'רז', role: 'מפ"צ', talk: { target: 7, yellow: 9, red: 12 } },
    cycle: { name: 'הצהובים' },
    trainees: ['נועה', 'דני'],
  });
  store.finishSetup();
  const dani = store.readTeam().find((t) => t.name === 'דני').id;
  const text = 'דיברתי עם דני. הוא נתקע בדיבאג של הרקורסיה וסיכמנו שיתרגל עם דף ועט.';
  store.recordEntry({ text, evidence: [{ trainee: dani, kind: 'talk', date: today(), excerpt: text }] });
  const tip = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP }).id;
  const hidden = JSON.parse(fs.readFileSync(new URL('../data/playbook.json', import.meta.url), 'utf8')).items[0].id;
  store.hidePlaybookItem(hidden, true);
  return { store, url, tip, hidden, cwd: workspace() };
}

// The new Cycle holds the Commander's scope, and the old one is archived.
function carriedOver({ store, url, tip, hidden }) {
  assert.equal(pointer().current === url, false, 'the new Cycle is current');
  assert.deepEqual(pointer().archived, [url]);
  assert.equal(stores().length, 2, 'the old store and one new one');
  const { cycle, commander, playbook } = store.readCycle();
  assert.equal(cycle.setup, 'done');
  assert.equal(cycle.previous, url);
  assert.equal(commander.settings.name, 'רז');
  assert.equal(commander.settings.role, 'מפ"צ');
  assert.deepEqual(commander.settings.talk, { target: 7, yellow: 9, red: 12 });
  assert.ok(playbook.some((p) => p.id === tip && p.text === TIP), 'the Playbook item came along');
  assert.deepEqual(commander.hides.hidden, [hidden]);
  const old = archivedStore(url).readCycle().cycle;
  assert.deepEqual([old.name, old.archived], ['הצהובים', true]);
}

test('a new Cycle from setup: settings shown to keep, nothing created before the yes, then carried over and the old Cycle archived', () => {
  const ctx = previousCycle();
  const session = newSession();
  const turn = (prompt) => {
    const reply = claude(ctx.cwd, prompt, session);
    session.resume = true;
    console.log(`> ${prompt}\n${reply}\n`);
    return reply;
  };

  assert.match(turn('/student-tracker:setup'), /מחזור חדש/);
  const question = turn('מחזור חדש');
  assert.match(question, /ממשיך עם/);
  assert.match(question, /מפ"צ/, 'the previous role is shown to keep');
  assert.match(question, /7/, 'and the Talk target');

  const summary = turn('הכתומים. החניכים: מאיה ואור.');
  assert.match(summary, /לאשר\?/);
  assert.match(summary, /הצהובים/, 'says what happens to the previous Cycle');
  assert.deepEqual(pointer().archived, [], 'nothing changes before the yes');
  assert.equal(ctx.store.connect().cycle, 'הצהובים');

  turn('כן');
  carriedOver(ctx);
  assert.match(ctx.store.readCycle().cycle.name, /כתומ/);
  assert.deepEqual(ctx.store.readTeam().map((t) => t.name).sort(), ['אור', 'מאיה']);
});

test('a new Cycle interrupted after it was created, before the copy and the archive, is finished by the next setup run', () => {
  const ctx = previousCycle();
  ctx.store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: ctx.url });
  const session = newSession();

  const summary = claude(ctx.cwd, '/student-tracker:setup', session);
  console.log(`summary:\n${summary}`);
  assert.match(summary, /לאשר\?/);
  assert.match(summary, /הכתומים/);
  assert.equal(archivedStore(ctx.url).readCycle().cycle.archived, false, 'not archived before the yes');

  console.log(`done:\n${claude(ctx.cwd, 'כן', { ...session, resume: true })}`);
  carriedOver(ctx);
  assert.deepEqual(ctx.store.readTeam().map((t) => t.name), ['מאיה']);
});

test('the previous Cycle is read in chat; an update aimed at it is refused and nothing is written anywhere', () => {
  const ctx = previousCycle();
  ctx.store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: ctx.url });
  ctx.store.copyCommanderScope(ctx.url);
  ctx.store.archiveCycle(ctx.url);
  ctx.store.finishSetup();
  const old = archivedStore(ctx.url);
  const dani = old.readTeam().find((t) => t.name === 'דני').id;
  const session = newSession();

  const answer = claude(ctx.cwd, 'מה היה עם דני במחזור הקודם?', session);
  console.log(`recall:\n${answer}`);
  assert.match(answer, /רקורסיה|דיבאג/, 'answers from the archived Cycle\'s record');

  const refused = claude(ctx.cwd, 'תרשום לדני מהמחזור הקודם שהוא הגיש היום את הפרויקט בזמן', { ...session, resume: true });
  console.log(`write:\n${refused}`);
  assert.match(refused, /בארכיון/);
  assert.equal(old.readTrainee(dani).entries.length, 1, 'nothing written to the archived Cycle');
  assert.equal(ctx.store.readTeam().length, 1, 'no Dani added to the new Cycle');
  assert.equal(ctx.store.readTrainee(ctx.store.readTeam()[0].id).entries.length, 0, 'and nothing recorded there');
});
