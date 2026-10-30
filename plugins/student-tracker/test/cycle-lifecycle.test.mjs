// Cycle lifecycle (ticket 26) through the storage seam: a new Cycle follows the current one,
// the Commander's scope (settings, Playbook items, hides) is copied forward, the old Cycle is
// archived, read-only, and still readable by its address from the pointer's `archived` list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');
const SEED = JSON.parse(fs.readFileSync(new URL('./fixtures/playbook-seed.json', import.meta.url), 'utf8')).items;
const TIP = 'לבקש ממנה להסביר לי את הקוד בקול לפני שאני מסתכל עליו.';

// A finished Cycle with a Commander who set up their own scope: role, Talk values, a Playbook
// item (one more, retired), a hidden base item, and a Talk with Dani.
function previousCycle() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-cycle-'));
  let tick = 0;
  const options = { dataDir, now: () => new Date(NOW.getTime() + 60_000 * tick++), base: () => SEED };
  const store = openStore(options);
  const { url } = store.createCycle({
    commander: { name: 'רז', role: 'מפ"צ', talk: { target: 7, yellow: 9, red: 12 } },
    cycle: { name: 'הצהובים' },
    trainees: ['נועה', 'דני'],
  });
  store.finishSetup();
  const dani = store.readTeam().find((t) => t.name === 'דני').id;
  store.recordEntry({
    text: 'דיברתי עם דני, הוא נתקע בדיבאג.',
    evidence: [{ trainee: dani, kind: 'talk', date: '2026-10-29', excerpt: 'דיברתי עם דני, הוא נתקע בדיבאג.' }],
  });
  const tip = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP });
  const old = store.savePlaybookItem({ kind: 'sign', skills: ['general'], text: 'משהו שכבר לא רלוונטי.' });
  store.retirePlaybookItem(old.id);
  store.hidePlaybookItem(SEED[0].id, true);
  return { dataDir, store, options, url, dani, tip: tip.id, retired: old.id };
}

const pointerOf = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'cycles.json'), 'utf8'));

// The whole new-Cycle path as setup runs it.
function newCycle(store, url, answers = {}) {
  const created = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url, ...answers });
  store.copyCommanderScope(url);
  store.archiveCycle(url);
  store.finishSetup();
  return created;
}

test('a new Cycle after a done one gets its own store, and the old one moves to the pointer\'s archived list at once', () => {
  const { dataDir, store, url } = previousCycle();
  const { url: next, trainees } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url });

  assert.notEqual(next, url);
  assert.deepEqual(pointerOf(dataDir), { current: next, archived: [url] });
  assert.deepEqual(store.connect(), { backend: 'local', url: next, cycle: 'הכתומים', setup: 'in-progress' });
  assert.equal(store.readCycle().cycle.previous, url, 'the new Cycle knows which one it follows');
  assert.deepEqual(trainees.map((t) => t.name), ['מאיה']);
  assert.deepEqual(store.readTeam().map((t) => t.name), ['מאיה'], 'Trainees belong to their Cycle');
});

test('with no new answers, the new Cycle keeps the previous Cycle\'s role and Talk values', () => {
  const { store, url } = previousCycle();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, previous: url });
  const { settings } = store.readCycle().commander;
  assert.equal(settings.role, 'מפ"צ');
  assert.deepEqual(settings.talk, { target: 7, yellow: 9, red: 12 });
});

test('answers changed at setup win over the previous Cycle\'s values', () => {
  const { store, url } = previousCycle();
  store.createCycle({ commander: { name: 'רז', role: 'מ"מ', talk: { target: 8 } }, cycle: { name: 'הכתומים' }, previous: url });
  const { settings } = store.readCycle().commander;
  assert.equal(settings.role, 'מ"מ');
  assert.deepEqual(settings.talk, { target: 8, yellow: 9, red: 12 });
});

test('a new Cycle over a done one is refused unless it names the current Cycle as the one it follows', () => {
  const { dataDir, store, url } = previousCycle();
  assert.throws(() => store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' } }), /כבר קיים מעקב למחזור הצהובים/);
  assert.throws(() => store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, previous: 'local:/elsewhere' }), /current Cycle/);
  assert.deepEqual(pointerOf(dataDir).archived, []);
  assert.equal(store.connect().url, url);
});

test('a new Cycle interrupted before the copy and the archive is resumed into the same store, then finished', () => {
  const { dataDir, store, options, url, tip } = previousCycle();
  const { url: next } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url });

  // A later setup run: the same answers again, by the same steps.
  const again = openStore(options);
  assert.equal(again.connect().setup, 'in-progress');
  assert.equal(again.readCycle().cycle.previous, url, 'the interrupted Cycle says which one it follows');
  assert.equal(again.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url }).url, next);
  assert.equal(again.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'] }).url, next, 'also when previous is not given again');
  again.copyCommanderScope(url);
  again.archiveCycle(url);
  again.finishSetup();

  assert.deepEqual(pointerOf(dataDir), { current: next, archived: [url] });
  assert.equal(fs.readdirSync(path.join(dataDir, 'local')).length, 2, 'the old store and one new one, never a third');
  assert.deepEqual(again.readTeam().map((t) => t.name), ['מאיה']);
  assert.equal(again.readCycle().cycle.previous, url);
  assert.ok(again.readCycle().playbook.some((p) => p.id === tip));
  assert.equal(openStore({ ...options, cycle: url }).readCycle().cycle.archived, true);
});

test('copyCommanderScope brings the Commander\'s Playbook items, retired ones too, and hides into the new Cycle', () => {
  const { store, url, tip, retired } = previousCycle();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url });
  const copied = store.copyCommanderScope(url);

  assert.deepEqual(copied.playbook.sort(), [tip, retired].sort());
  assert.deepEqual(copied.hidden, [SEED[0].id]);
  const { playbook, commander } = store.readCycle();
  const byId = Object.fromEntries(playbook.map((p) => [p.id, p]));
  assert.equal(byId[tip].text, TIP, 'word-for-word, same id');
  assert.equal(byId[tip].retired, false);
  assert.ok(byId[retired].retired, 'a retired item stays retired');
  assert.deepEqual(commander.hides.hidden, [SEED[0].id]);

  const maya = store.readTeam()[0].id;
  const advice = store.readPlaybook(maya, { skills: ['impl.debugging'] });
  assert.equal(advice.targets[0].items[0].id, tip, 'the Commander\'s item comes first in the new Cycle\'s Advice');
  assert.ok(!advice.targets[0].items.some((i) => i.id === SEED[0].id), 'the hidden base item stays hidden');
});

test('copying again changes nothing, and keeps what the new Cycle already has of its own', () => {
  const { store, url, tip } = previousCycle();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, previous: url });
  store.copyCommanderScope(url);
  const before = store.readCycle();
  const again = store.copyCommanderScope(url);
  assert.deepEqual(again.playbook, [], 'nothing left to copy');
  assert.deepEqual(again.hidden, []);
  assert.deepEqual(store.readCycle().playbook, before.playbook);
  assert.deepEqual(store.readCycle().commander, before.commander);
  assert.ok(store.readCycle().playbook.some((p) => p.id === tip));
});

test('a Playbook item tagged to a Skill the Commander added comes with that Skill', () => {
  const { store, url } = previousCycle();
  const { skill } = store.updateCycle({ addSkill: { name: 'ניהול זמן', group: 'impl' } });
  const item = store.savePlaybookItem({ kind: 'exercise', skills: [skill.id], text: 'לתכנן את היום בבוקר עם שעון.' });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url });
  store.copyCommanderScope(url);

  const impl = store.readCycle().skills.groups.find((g) => g.id === 'impl');
  assert.ok(impl.skills.some((k) => k.id === skill.id && k.name === 'ניהול זמן'), 'the added Skill joins the same Stage, same id');
  const maya = store.readTeam()[0].id;
  assert.equal(store.readPlaybook(maya, { skills: [skill.id] }).targets[0].items[0].id, item.id);
  assert.equal(store.savePlaybookItem({ id: item.id, band: 'low' }).band, 'low', 'and the item can still be edited');
});

test('copyCommanderScope is setup\'s: refused from the current Cycle itself, an unknown one, or once setup is done', () => {
  const { store, url } = previousCycle();
  assert.throws(() => store.copyCommanderScope(url), /current Cycle/);
  const { url: next } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, previous: url });
  assert.throws(() => store.copyCommanderScope(next), /current Cycle/);
  assert.throws(() => store.copyCommanderScope('local:/nowhere'), /no Cycle/);
  store.finishSetup();
  assert.throws(() => store.copyCommanderScope(url), /setup/);
});

test('archiving marks the old Cycle archived and keeps it in the pointer\'s archived list; again is harmless', () => {
  const { dataDir, store, options, url } = previousCycle();
  const { url: next } = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, previous: url });
  store.archiveCycle(url);
  store.archiveCycle(url);
  assert.deepEqual(pointerOf(dataDir), { current: next, archived: [url] });
  const old = openStore({ ...options, cycle: url }).readCycle().cycle;
  assert.equal(old.archived, true);
  assert.match(old.archivedAt, /^2026-10-30T/);
  assert.equal(old.setup, 'done');
  assert.throws(() => store.archiveCycle(next), /current Cycle/);
});

test('an Entry left half-written in the previous Cycle is finished when it is archived, not frozen half-done', () => {
  const { store, options, url, dani } = previousCycle();
  const text = 'דיברתי עם דני ועם נועה על הפרויקט.';
  const noa = store.readTeam().find((t) => t.name === 'נועה').id;
  const crashing = openStore({ ...options, interrupt: (point) => { if (point === 'chunk-written') throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry({
    text,
    evidence: [
      { trainee: dani, kind: 'talk', date: '2026-10-30', excerpt: text },
      { trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: text },
    ],
  }), /crash/);
  newCycle(store, url);

  const old = openStore({ ...options, cycle: url });
  assert.deepEqual(old.readTeam().map((t) => t.lastTalk).sort(), ['2026-10-30', '2026-10-30'], 'both chunks written');
  assert.equal(old.readTrainee(noa).entries.find((e) => e.text === text).status, 'done');
});

test('the whole path: the new Cycle is current and done, the old one archived, the Commander\'s scope carried over', () => {
  const { dataDir, store, url, tip } = previousCycle();
  const { url: next } = newCycle(store, url);
  assert.deepEqual(pointerOf(dataDir), { current: next, archived: [url] });
  assert.deepEqual(store.connect(), { backend: 'local', url: next, cycle: 'הכתומים', setup: 'done' });
  const { commander, playbook } = store.readCycle();
  assert.equal(commander.settings.role, 'מפ"צ');
  assert.ok(playbook.some((p) => p.id === tip));
  assert.deepEqual(commander.hides.hidden, [SEED[0].id]);
});

test('an archived Cycle is still read by its address: its Cycle, cards and a Trainee\'s records', () => {
  const { store, options, url, dani, tip } = previousCycle();
  newCycle(store, url);
  const old = openStore({ ...options, cycle: url });
  assert.equal(old.readCycle().cycle.name, 'הצהובים');
  assert.deepEqual(old.readTeam().map((t) => t.name).sort(), ['דני', 'נועה']);
  const record = old.readTrainee(dani);
  assert.equal(record.entries[0].text, 'דיברתי עם דני, הוא נתקע בדיבאג.');
  assert.equal(record.card.lastTalk, '2026-10-29');
  assert.equal(old.readPlaybook(dani, { skills: ['impl.debugging'] }).targets[0].items[0].id, tip);
  assert.throws(() => openStore({ ...options, cycle: 'local:/elsewhere' }).readCycle(), /no Cycle local:\/elsewhere in the pointer/);
});

test('every write to an archived Cycle is refused, naming the current Cycle, and writes nothing', () => {
  const { store, options, url, dani, tip } = previousCycle();
  newCycle(store, url);
  const old = openStore({ ...options, cycle: url });
  const before = JSON.stringify([old.readCycle(), old.readTeam(), old.readTrainee(dani)]);
  const writes = [
    () => old.recordEntry({ text: 'דני הגיש.', evidence: [{ trainee: dani, kind: 'note', date: '2026-10-30', excerpt: 'דני הגיש.' }] }),
    () => old.recordAssessments(dani, [{ skill: 'impl.debugging', score: 3, author: 'commander', reason: 'כך', evidence: [] }]),
    () => old.retractEntry(),
    () => old.hardDelete(old.readTrainee(dani).entries[0].id),
    () => old.updateTrainee(null, { add: { name: 'אור' } }),
    () => old.updateSettings({ name: 'רזי' }),
    () => old.updateCycle({ addSkill: { name: 'ניהול זמן', group: 'impl' } }),
    () => old.savePlaybookItem({ kind: 'tip', skills: ['general'], text: 'טיפ.' }),
    () => old.retirePlaybookItem(tip),
    () => old.hidePlaybookItem(SEED[1].id, true),
    () => old.flipSensitive(old.readTrainee(dani).evidence[0].id, { category: 'other' }),
    () => old.resumePending(),
    () => old.rebuildCard(dani),
    () => old.finishSetup(),
    () => old.recordNextTalk(dani, ['איך הולך?', 'מה עם הפרויקט?']),
    () => old.takeAlert(),
    () => old.copyCommanderScope(url),
  ];
  for (const w of writes) assert.throws(w, /המחזור הצהובים בארכיון — אפשר רק לקרוא ממנו\. עדכונים נרשמים במחזור הנוכחי, הכתומים\./);
  assert.equal(JSON.stringify([old.readCycle(), old.readTeam(), old.readTrainee(dani)]), before);
});

test('a pointer that names an archived Cycle as current still refuses writes to it', () => {
  const { dataDir, store, options, url, dani } = previousCycle();
  newCycle(store, url);
  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current: url, archived: [] }));
  const old = openStore(options);
  assert.equal(old.connect().archived, true, 'connect says so');
  assert.equal(old.readCycle().cycle.name, 'הצהובים');
  assert.throws(() => old.updateTrainee(dani, { rename: { name: 'דני ל.' } }), /המחזור הצהובים בארכיון/);
});

test('with the pointer lost, connect never adopts an archived Cycle', () => {
  const { dataDir, store, url } = previousCycle();
  const { url: next } = newCycle(store, url);
  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current: null, archived: [] }));
  assert.equal(store.connect().url, next);
});

test('with the pointer lost, connect finds the earlier Cycles again through the ones each follows, so they stay readable', () => {
  const { dataDir, store, options, url, dani } = previousCycle();
  const { url: second } = newCycle(store, url);
  const third = store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הירוקים' }, previous: second }).url;
  store.copyCommanderScope(second);
  store.archiveCycle(second);
  store.finishSetup();

  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current: null, archived: [] }));
  assert.equal(store.connect().url, third);
  assert.deepEqual(pointerOf(dataDir), { current: third, archived: [url, second] }, 'oldest first, as setup adds them');
  assert.equal(openStore({ ...options, cycle: url }).readTrainee(dani).card.lastTalk, '2026-10-29');

  // A pointer whose archived list was emptied by hand is mended the same way.
  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current: third, archived: [] }));
  store.connect();
  assert.deepEqual(pointerOf(dataDir).archived, [url, second]);
});
