// The Commander's own Playbook (ticket 24) through the storage seam: their items are saved
// word-for-word, edited and retired; base items are hidden and un-hidden; Advice follows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function setUp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-pbitems-'));
  let tick = 0;
  const store = openStore({ dataDir, now: () => new Date(NOW.getTime() + 60_000 * tick++) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id, dataDir };
}

const ids = (items) => items.map((i) => i.id);
const TIP = 'לבקש ממנה להסביר לי את הקוד בקול לפני שאני מסתכל עליו.';

test('a saved Commander item is kept word-for-word, live, and comes first in Advice', () => {
  const { store, id } = setUp();
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP });
  assert.match(pid, /^p-[a-z0-9]{4}$/);
  const [{ at, ...saved }] = store.readCycle().playbook;
  assert.deepEqual(saved, {
    id: pid, origin: 'commander', kind: 'tip', skills: ['impl.debugging'], band: null, text: TIP, source: null, retired: false,
  });
  assert.match(at, /^2026-10-30T09:\d\d:00[+-]\d\d:\d\d$/);
  const { targets } = store.readPlaybook(id['נועה'], { skills: ['impl.debugging'] });
  assert.equal(targets[0].items[0].id, pid);
  assert.equal(targets[0].items[0].origin, 'commander');
  assert.equal(targets[0].items[0].text, TIP);
});

test('a save is refused, writing nothing, without a known kind, its text, or Skills of this Cycle', () => {
  const { store } = setUp();
  const save = (extra) => () => store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP, ...extra });
  assert.throws(save({ kind: 'trick' }), /trick/);
  assert.throws(save({ text: '  ' }), /text/);
  assert.throws(save({ skills: [] }), /Skill/);
  assert.throws(save({ skills: ['impl.debuging'] }), /impl\.debuging/);
  assert.throws(save({ skills: ['general', 'impl.debugging'] }), /general/);
  assert.throws(save({ band: 'top' }), /top/);
  assert.throws(save({ skills: ['general'], band: 'low' }), /general/);
  assert.throws(save({ origin: 'base' }), /origin/);
  assert.deepEqual(store.readCycle().playbook, []);
});

test('a Skill the Commander added takes items; an archived Skill takes no new ones', () => {
  const { store } = setUp();
  const { skill } = store.updateCycle({ addSkill: { name: 'ניהול זמן', group: 'impl' } });
  const saved = store.savePlaybookItem({ kind: 'exercise', skills: [skill.id], band: 'low', text: 'לתכנן את היום בבוקר עם שעון.' });
  assert.deepEqual(saved.skills, [skill.id]);
  store.updateCycle({ archiveSkill: { skill: 'impl.readability' } });
  assert.throws(() => store.savePlaybookItem({ kind: 'tip', skills: ['impl.readability'], text: 'טיפ' }), /archived/);
});

const ENTRY = 'דיברתי עם נועה. ישבנו יחד והיא הסבירה לי את הקוד בקול, ככה מצאה לבד את הבאג. אבא שלה בבית חולים.';

test('an item taken from an Entry links to it and must be word-for-word from it, with no sensitive part', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const { entry } = store.recordEntry({
    text: ENTRY,
    evidence: [{
      trainee: noa, kind: 'talk', date: '2026-10-30',
      excerpt: 'דיברתי עם נועה. ישבנו יחד והיא הסבירה לי את הקוד בקול, ככה מצאה לבד את הבאג. [פרט אישי — בתיק]',
      sensitive: [{ category: 'health', excerpt: 'אבא שלה בבית חולים.' }],
    }],
  });
  const save = (text, source = entry) => store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text, source });
  assert.throws(() => save('ישבנו יחד והיא הסבירה את הקוד'), /word-for-word/);
  assert.throws(() => save('אבא שלה בבית חולים.'), /sensitive/);
  assert.throws(() => save('ישבנו יחד', 'e-20990101-0000-zz'), /no Entry/);
  const saved = save('ישבנו יחד והיא הסבירה לי את הקוד בקול');
  assert.equal(saved.source, entry);
  assert.equal(saved.text, 'ישבנו יחד והיא הסבירה לי את הקוד בקול');

  store.retractEntry(entry);
  assert.throws(() => save('ככה מצאה לבד את הבאג'), /retracted/);
  assert.equal(store.readCycle().playbook.length, 1, 'retracting the Entry leaves the item: it is advice, not Evidence');
});

test('an edit changes only what is given, keeps the id and when it was added, and notes when it changed', () => {
  const { store } = setUp();
  const first = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], band: 'low', text: TIP });
  const edited = store.savePlaybookItem({ id: first.id, text: 'לבקש ממנה להסביר בקול.', skills: ['impl.debugging', 'inter.communication'] });
  assert.deepEqual({ ...edited, edited: undefined }, {
    ...first, text: 'לבקש ממנה להסביר בקול.', skills: ['impl.debugging', 'inter.communication'], edited: undefined,
  });
  assert.ok(edited.edited > first.at);
  assert.equal(store.savePlaybookItem({ id: first.id, band: null }).band, null, 'band: null clears the band');
  assert.deepEqual(store.readCycle().playbook.map((i) => i.id), [first.id], 'still one item');
});

test('an edit is refused on a base item, an unknown id and a retired item', () => {
  const { store } = setUp();
  assert.throws(() => store.savePlaybookItem({ id: 'b-001', text: 'אחר' }), /base/);
  assert.throws(() => store.savePlaybookItem({ id: 'p-zzzz', text: 'אחר' }), /p-zzzz/);
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['general'], text: TIP });
  store.retirePlaybookItem(pid);
  assert.throws(() => store.savePlaybookItem({ id: pid, text: 'אחר' }), /retired/);
  assert.throws(() => store.savePlaybookItem({ id: '../meta/cycle', text: 'אחר' }), /no Playbook item/);
});

test('an edit with nothing to change is refused', () => {
  const { store } = setUp();
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['general'], text: TIP });
  assert.throws(() => store.savePlaybookItem({ id: pid }), /nothing to change/);
});

test('a retired item stays stored but leaves Advice; retiring is refused twice and on a base item', () => {
  const { store, id } = setUp();
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: TIP });
  const retired = store.retirePlaybookItem(pid);
  assert.equal(retired.text, TIP);
  assert.match(retired.retired.at, /^2026-10-30T/);
  assert.deepEqual(store.readCycle().playbook.map((i) => [i.id, Boolean(i.retired)]), [[pid, true]]);
  const { targets } = store.readPlaybook(id['נועה'], { skills: ['impl.debugging'] });
  assert.ok(!ids(targets[0].items).includes(pid));
  assert.throws(() => store.retirePlaybookItem(pid), /already retired/);
  assert.throws(() => store.retirePlaybookItem('b-001'), /hide/);
  assert.throws(() => store.retirePlaybookItem('p-zzzz'), /p-zzzz/);
});

test('a hidden base item leaves Advice and comes back when un-hidden; the Commander\'s items come first', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  store.recordEntry({
    text: 'נועה נתקעה שוב בבאג',
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-29', excerpt: 'נועה נתקעה שוב בבאג' }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 2, author: 'agent', reason: 'נתקעת', evidence: ['#1'] }],
  });
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], band: 'low', text: TIP });
  const items = () => ids(store.readPlaybook(noa, { skills: ['impl.debugging'] }).targets[0].items);
  assert.deepEqual(items(), [pid, 'b-001', 'b-003', 'b-005', 'b-007', 'b-008']);

  assert.deepEqual(store.hidePlaybookItem('b-003', true), { hidden: ['b-003'] });
  assert.deepEqual(store.hidePlaybookItem('b-003', true), { hidden: ['b-003'] }, 'hiding twice is harmless');
  assert.deepEqual(store.readCycle().commander.hides, { hidden: ['b-003'] });
  assert.ok(!items().includes('b-003'));

  assert.deepEqual(store.hidePlaybookItem('b-003', false), { hidden: [] });
  assert.ok(items().includes('b-003'));
});

test('hiding is refused on a Commander item and an id that does not ship; un-hiding a gone id is allowed', () => {
  const { store } = setUp();
  const { id: pid } = store.savePlaybookItem({ kind: 'tip', skills: ['general'], text: TIP });
  assert.throws(() => store.hidePlaybookItem(pid, true), /retire/);
  assert.throws(() => store.hidePlaybookItem('b-999', true), /b-999/);
  assert.throws(() => store.hidePlaybookItem('b-001'), /true or false/);
  assert.deepEqual(store.hidePlaybookItem('b-999', false), { hidden: [] });
});
