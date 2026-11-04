// One engine for both backends (lean-turns spec), for the roster, settings, Cycle-change and
// Playbook operations: each run directly on the local backend and through snapshot → plan →
// apply leaves identical stores and gives identical results and refusals. The planned run's
// snapshot holds exactly the reads the operation's manifest names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { NOW, seededRand, fixture } from './fixtures/plan-seam.mjs';
import { assertSame } from './fixtures/cycle-seam.mjs';

test('update-settings: a changed name, role and Talk target, and a refused threshold', () => {
  const { dataDir } = fixture();
  assertSame(dataDir, 'update-settings', { input: 'name: רז כ.\nrole: מ"מ\ntarget: 7\n' });
  assertSame(dataDir, 'update-settings', { input: 'yellow: 20\n', refuses: true });
});

const MARK = '[פרט אישי — בתיק]';

// A fixture Cycle with history: a Talk with a sensitive part about נועה, and דני who left.
function withHistory() {
  const f = fixture(['נועה', 'דני', 'מאיה']);
  const [noa, dani] = [f.id['נועה'], f.id['דני']];
  const entry = f.store.recordEntry({
    text: 'נועה פתרה את הבאג לבד. אבא שלה בבית חולים.',
    evidence: [{
      trainee: noa, kind: 'note', date: '2026-10-28', excerpt: `נועה פתרה את הבאג לבד. ${MARK}`,
      sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.' }],
    }],
  });
  f.store.updateTrainee(dani, { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' } });
  return { ...f, noa, dani, maya: f.id['מאיה'], entry };
}

test('update-trainee: add, rename, Status, leaving and rejoining, the same both ways', () => {
  const { dataDir, noa, dani, maya, entry } = withHistory();
  assertSame(dataDir, 'update-trainee', { input: 'add: יואב\n' });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'rename: נועה כ.\n' });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: `status: watch\nreason: צריכה ליווי בדיבאג\nevidence: ${entry.evidence[0]}\n` });
  assertSame(dataDir, 'update-trainee', { args: [maya], input: 'leave: 2026-10-30\nhow: other\nreason: סיימה מוקדם\n' });
  assertSame(dataDir, 'update-trainee', { args: [dani], input: 'rejoin\n' });
});

test('update-trainee: refusals are the same both ways', () => {
  const { dataDir, noa, dani, maya } = withHistory();
  assertSame(dataDir, 'update-trainee', { input: 'add: נועה\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [maya], input: 'rename: נועה\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: ['t-nobody'], input: 'rename: מישהו\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'status: watch\nreason: אבא שלה בבית חולים.\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [dani], input: 'leave: 2026-10-30\nhow: other\nreason: שוב\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'rejoin\n', refuses: true });
});

// A base Playbook item id of the shipped Playbook.
const BASE_ID = JSON.parse(fs.readFileSync(new URL('../data/playbook.json', import.meta.url), 'utf8')).items[0].id;

// withHistory plus an item of the Commander's, a retired one and a hidden base item.
function withPlaybook() {
  const f = withHistory();
  const own = f.store.savePlaybookItem({ kind: 'tip', skills: ['learn.self-awareness'], text: 'לשאול מה ניסתה לפני שעוזרים' });
  const retired = f.store.savePlaybookItem({ kind: 'tip', skills: ['general'], text: 'פריט ישן' });
  f.store.retirePlaybookItem(retired.id);
  f.store.hidePlaybookItem(BASE_ID, true);
  return { ...f, own: own.id, retired: retired.id };
}

test('Playbook items: save, save from an Entry, edit, retire, hide and unhide, the same both ways', () => {
  const { dataDir, own, entry } = withPlaybook();
  assertSame(dataDir, 'save-playbook-item', { input: '+kind: exercise\n+skills: learn.self-awareness\n+band: low\nלפתור באג ביחד מול הלוח\n' });
  assertSame(dataDir, 'save-playbook-item', { input: `+kind: tip\n+skills: general\n+source: ${entry.entry}\nנועה פתרה את הבאג לבד.\n` });
  assertSame(dataDir, 'save-playbook-item', { args: [own], input: '+band: mid\n' });
  assertSame(dataDir, 'retire-playbook-item', { args: [own] });
  assertSame(dataDir, 'hide-playbook-item', { args: [BASE_ID] });
  assertSame(dataDir, 'unhide-playbook-item', { args: [BASE_ID] });
});

test('Playbook items: refusals are the same both ways', () => {
  const { dataDir, own, retired, entry } = withPlaybook();
  assertSame(dataDir, 'save-playbook-item', { input: `+kind: tip\n+skills: general\n+source: ${entry.entry}\nאבא שלה בבית חולים.\n`, refuses: true });
  assertSame(dataDir, 'save-playbook-item', { input: '+kind: tip\n+skills: general\n+source: e-nothing\nמשהו\n', refuses: true });
  assertSame(dataDir, 'save-playbook-item', { args: [retired], input: '+band: mid\n', refuses: true });
  assertSame(dataDir, 'save-playbook-item', { args: ['p-none'], input: '+band: mid\n', refuses: true });
  assertSame(dataDir, 'retire-playbook-item', { args: [retired], refuses: true });
  assertSame(dataDir, 'retire-playbook-item', { args: [BASE_ID], refuses: true });
  assertSame(dataDir, 'hide-playbook-item', { args: ['b-nothing'], refuses: true });
  assertSame(dataDir, 'hide-playbook-item', { args: [own], refuses: true });
});

test('update-cycle: preset, Skill and team changes, and refusals, the same both ways', () => {
  const { dataDir, noa, maya } = withHistory();
  const cycle = readCycle(dataDir);
  const subject = cycle.preset.subjects[0].id;
  const project = cycle.preset.projects[0].id;
  const group = cycle.skills.groups[0].id;
  const skill = cycle.skills.groups[0].skills[0].id;
  assertSame(dataDir, 'update-cycle', { input: `add-test: מבחן חדש\nsubject: ${subject}\n` });
  assertSame(dataDir, 'update-cycle', { input: `add-project: פרויקט חדש\nsubject: ${subject}\n` });
  assertSame(dataDir, 'update-cycle', { input: `remove-project: ${project}\n` });
  assertSame(dataDir, 'update-cycle', { input: `add-skill: הקשבה\ngroup: ${group}\n` });
  assertSame(dataDir, 'update-cycle', { input: `archive-skill: ${skill}\n` });
  assertSame(dataDir, 'update-cycle', { input: `team: הנמרים\nproject: ${project}\nmember: ${noa}\nmember: ${maya}\n` });
  assertSame(dataDir, 'update-cycle', { input: `add-test: מבחן\nsubject: no-such-subject\n`, refuses: true });
  assertSame(dataDir, 'update-cycle', { input: `restore-skill: ${skill}\n`, refuses: true });
  assertSame(dataDir, 'update-cycle', { input: `team: הנמרים\nproject: ${project}\nmember: t-nobody\n`, refuses: true });
});

test('a team kept by its Project: removing the Project is refused the same both ways', () => {
  const { dataDir, noa, store } = withHistory();
  const project = readCycle(dataDir).preset.projects[0].id;
  store.updateCycle({ setTeam: { project, name: 'הנמרים', members: [noa] } });
  assertSame(dataDir, 'update-cycle', { input: `remove-project: ${project}\n`, refuses: true });
});

test('finish-setup: a Cycle in setup is marked done, and a done one is returned as it is', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-setup-'));
  openStore({ dataDir, now: () => NOW, rand: seededRand(7) }).createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה'] });
  assertSame(dataDir, 'finish-setup');
  const { dataDir: done } = fixture();
  assertSame(done, 'finish-setup');
});

const readCycle = (dataDir) => openStore({ dataDir }).readCycle();
