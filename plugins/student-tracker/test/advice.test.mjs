// Advice's raw material through the storage seam (ticket 23): readPlaybook picks the Playbook
// items for a Trainee's target Skills, and the card's next-Talk questions are records of their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { openDocs } from '../lib/docs.mjs';
import { checkPlaybook } from '../lib/playbook.mjs';

const NOW = new Date('2026-10-30T09:15:00');
// A small fixed Playbook, so these tests pin the pick rule, not the shipped content.
const SEED = JSON.parse(fs.readFileSync(new URL('./fixtures/playbook-seed.json', import.meta.url), 'utf8'));
const seedBase = (framework) => {
  assert.deepEqual(checkPlaybook(SEED, framework), []);
  return SEED.items;
};

function setUp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-advice-'));
  let tick = 0;
  const store = openStore({ dataDir, now: () => new Date(NOW.getTime() + 1000 * tick++), base: seedBase });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // The Commander's own items and hides are written by ticket 24's operations; seed them directly.
  const docs = openDocs(store.connect().url.slice('local:'.length));
  return { store, id, docs };
}

let n = 0;
function rate(store, tid, skill, score, date = '2026-10-29') {
  const text = `הערה על ${skill} מספר ${++n}`;
  store.recordEntry({
    text,
    evidence: [{ trainee: tid, kind: 'note', date, excerpt: text }],
    assessments: [{ trainee: tid, skill, score, author: 'agent', reason: 'סיבה', evidence: ['#1'] }],
  });
}

const ids = (items) => items.map((i) => i.id);

test('a focus Skill rated 2 gets its low-band and untagged items, plus the general ones; nothing is stored', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  rate(store, noa, 'impl.debugging', 2);
  const before = [store.readCycle(), store.readTrainee(noa, { retracted: true })];

  const { targets, general } = store.readPlaybook(noa, { skills: ['impl.debugging'] });
  assert.deepEqual(targets.map(({ items, ...t }) => t), [
    { skill: 'impl.debugging', name: 'יכולות דיבאג', rating: 2, trend: null, focus: true },
  ]);
  assert.deepEqual(ids(targets[0].items), ['b-001', 'b-003', 'b-005', 'b-007', 'b-008']);
  assert.deepEqual(targets[0].items[0], {
    id: 'b-001', origin: 'base', kind: 'sign', skills: ['impl.debugging'], band: 'low',
    text: 'מבקש/ת עזרה ברגע שמשהו לא עובד, בלי לנסות קודם לבודד איפה הבעיה.',
  });
  assert.deepEqual(ids(general), ['b-015', 'b-016', 'b-017']);
  assert.deepEqual([store.readCycle(), store.readTrainee(noa, { retracted: true })], before, 'Advice is never stored');
});

test('an unrated Skill gets only untagged items', () => {
  const { store, id } = setUp();
  const { targets } = store.readPlaybook(id['נועה'], { skills: ['inter.communication'] });
  assert.equal(targets[0].rating, null);
  assert.deepEqual(ids(targets[0].items), ['b-010', 'b-011']);
});

test('with no focus, the targets are the declining Skills, then the lowest, three at most', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  rate(store, noa, 'inter.communication', 5, '2026-09-20');
  rate(store, noa, 'inter.communication', 4);
  rate(store, noa, 'impl.debugging', 2);
  rate(store, noa, 'learn.independence', 3);
  rate(store, noa, 'impl.readability', 4);
  rate(store, noa, 'inter.teamwork', 5);
  const { targets } = store.readPlaybook(noa);
  assert.deepEqual(targets.map((t) => [t.skill, t.rating, t.trend, t.focus]), [
    ['inter.communication', 4, '↓', false],
    ['impl.debugging', 2, null, false],
    ['learn.independence', 3, null, false],
  ]);
  // Rated 4: the high band fits, low and mid don't.
  assert.deepEqual(ids(targets[0].items), ['b-010', 'b-011']);
  assert.deepEqual(ids(targets[2].items), ['b-012', 'b-014']);
});

test('a Trainee with no Ratings and no focus gets only the general items', () => {
  const { store, id } = setUp();
  const { targets, general } = store.readPlaybook(id['נועה']);
  assert.deepEqual(targets, []);
  assert.deepEqual(ids(general), ['b-015', 'b-016', 'b-017']);
});

test('the Commander\'s items come first and fit the band too; retired ones and hidden base items are left out', () => {
  const { store, id, docs } = setUp();
  const noa = id['נועה'];
  rate(store, noa, 'impl.debugging', 2);
  const own = (pid, extra) => ({
    op: 'create', path: `playbook/${pid}`,
    data: { kind: 'tip', text: `טיפ ${pid}`, skills: ['impl.debugging'], origin: 'commander', retired: false, at: '2026-10-01T10:00:00+03:00', ...extra },
  });
  docs.batch([
    own('p-1', {}),
    own('p-2', { band: 'high' }),
    own('p-3', { retired: { at: '2026-10-02T10:00:00+03:00' } }),
    own('p-4', { skills: ['general'] }),
    { op: 'set', path: 'commander/hides', data: { hidden: ['b-003', 'b-999'] }, ifVersion: docs.get('commander/hides').version },
  ]);
  const { targets, general } = store.readPlaybook(noa, { skills: ['impl.debugging'] });
  assert.deepEqual(ids(targets[0].items), ['p-1', 'b-001', 'b-005', 'b-007', 'b-008']);
  assert.equal(targets[0].items[0].origin, 'commander');
  assert.deepEqual(ids(general), ['p-4', 'b-015', 'b-016', 'b-017'], 'a hide over an id that no longer ships is ignored');
});

test('readPlaybook refuses an unknown Trainee or Skill', () => {
  const { store, id } = setUp();
  assert.throws(() => store.readPlaybook('t-nobody'), /unknown Trainee/);
  assert.throws(() => store.readPlaybook(id['נועה'], { skills: ['impl.debuging'] }), /impl\.debuging/);
});

// The next-Talk questions (ticket 08): a form of Advice the card keeps for the dashboard.
const TALK = 'דיברתי עם נועה על הבאג בפרויקט, היא מצאה אותו לבד עם הדפסות.';
const talk = (tid, extra = {}, text = TALK) => ({
  text,
  evidence: [{ trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: text }],
  ...extra,
});
const Q = ['איך מצאת את הבאג הפעם?', 'מה תנסי קודם בפעם הבאה שתיתקעי?', 'על מה היית רוצה שנעבוד עד השיחה הבאה?'];

test('the next-Talk questions go with an Entry as a change record, and the card shows the latest', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const r = store.recordEntry(talk(noa, { changes: [{ type: 'nextTalk', trainee: noa, questions: Q.slice(0, 2) }] }));
  const { card, changes } = store.readTrainee(noa);
  const change = changes.find((c) => c.type === 'nextTalk');
  assert.deepEqual([change.id, change.by, change.entry, change.questions], [r.changes[0], 'agent', r.entry, Q.slice(0, 2)]);
  assert.deepEqual(card.nextTalk, { questions: Q.slice(0, 2), at: change.at });

  // An Entry without new questions leaves them; one with new questions replaces them.
  store.recordEntry(talk(noa, {}, 'נועה הגישה את התרגיל בזמן.'));
  assert.deepEqual(store.readTrainee(noa).card.nextTalk.questions, Q.slice(0, 2));
  store.recordEntry(talk(noa, { changes: [{ type: 'nextTalk', trainee: noa, questions: Q }] }, 'נועה עזרה לדני בדיבאג.'));
  assert.deepEqual(store.readTrainee(noa).card.nextTalk.questions, Q);

  // They are rebuilt from records: a Retraction falls back to the ones before.
  assert.deepEqual(store.rebuildCard(noa).nextTalk.questions, Q);
  store.retractEntry();
  assert.deepEqual(store.readTrainee(noa).card.nextTalk.questions, Q.slice(0, 2));
});

test('next-Talk questions are two or three distinct questions about a Trainee the Entry is about', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const withQ = (questions, trainee = noa) => talk(noa, { changes: [{ type: 'nextTalk', trainee, questions }] });
  assert.throws(() => store.recordEntry(withQ([Q[0]])), /two or three/);
  assert.throws(() => store.recordEntry(withQ([...Q, 'ועוד אחת?'])), /two or three/);
  assert.throws(() => store.recordEntry(withQ([Q[0], ' '])), /empty/);
  assert.throws(() => store.recordEntry(withQ([Q[0], Q[0]])), /twice/);
  assert.throws(() => store.recordEntry(withQ(Q, id['דני'])), /no Evidence in this Entry/);
  assert.throws(() => store.recordEntry(talk(noa, { changes: [{ type: 'nextTalk', trainee: noa, questions: Q, by: 'commander' }] })), /only trainee and questions/);
  assert.deepEqual(store.readTrainee(noa).evidence, [], 'a refusal writes nothing');
});

test('next-Talk questions are display-safe: none repeats a sensitive part of this Entry or of the Trainee\'s records', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const SAD = 'אבא שלה מאושפז בבית חולים.';
  const text = `דיברתי עם נועה. ${SAD}`;
  const entry = (questions) => ({
    text,
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: 'דיברתי עם נועה. [פרט אישי — בתיק]', sensitive: [{ category: 'family', excerpt: SAD }] }],
    changes: [{ type: 'nextTalk', trainee: noa, questions }],
  });
  assert.throws(() => store.recordEntry(entry(['איך אבא שלה מאושפז?', Q[1]])), /sensitive/);
  store.recordEntry(entry(['איך את מרגישה השבוע?', Q[1]]));

  // Later, with no sensitive part in the Entry, the stored one still counts.
  const later = ['מה שלום אבא, הוא עדיין מאושפז בבית חולים?', Q[1]];
  assert.throws(() => store.recordEntry(talk(noa, { changes: [{ type: 'nextTalk', trainee: noa, questions: later }] })), /sensitive/);
});

test('a re-rate can bring fresh next-Talk questions with it', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const r = store.recordEntry(talk(noa));
  const rerate = (score, author, nextTalk) => store.recordAssessments(noa, [{ skill: 'impl.debugging', score, author, reason: 'מוצאת באגים לבד', evidence: r.evidence }], { nextTalk });
  rerate(3, 'agent', Q.slice(1));
  const { card, changes } = store.readTrainee(noa);
  assert.deepEqual(card.nextTalk.questions, Q.slice(1));
  const change = changes.find((c) => c.type === 'nextTalk');
  assert.match(change.id, /^c-\d{8}-\d{4}-\w{2}$/);
  assert.equal(change.entry, null);
  assert.throws(() => rerate(4, 'commander', [Q[0]]), /two or three/);
});
