// Trainee state: Status, evaluation-process stage, Snapshot and improve/keep items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, MARK } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function setUp(trainees = ['נועה', 'דני']) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-data-'));
  // A clock that moves a second per call, so records written one after another are ordered.
  let tick = 0;
  const store = openStore({ dataDir, now: () => new Date(NOW.getTime() + 1000 * tick++) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id };
}

const TALK = 'דיברתי עם נועה, היא לא הגישה את התרגיל השלישי ברצף.';
const talkOf = (tid, extra = {}) => ({
  text: TALK,
  evidence: [{ trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: TALK }],
  ...extra,
});

test('the agent sets a Status with a reason on the Evidence it rests on, as a change record', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const r = store.recordEntry(talkOf(tid, {
    changes: [{ trainee: tid, type: 'status', to: 'watch', reason: 'לא מגישה תרגילים שבוע שלישי', evidence: ['#1'] }],
  }));
  const { card, changes } = store.readTrainee(tid);
  assert.deepEqual(card.status, { value: 'watch', by: 'agent', reason: 'לא מגישה תרגילים שבוע שלישי', at: card.status.at });
  const change = changes.find((c) => c.type === 'status');
  assert.equal(change.id, r.changes[0]);
  assert.deepEqual(
    [change.from, change.to, change.by, change.reason, change.evidence, change.entry],
    [null, 'watch', 'agent', 'לא מגישה תרגילים שבוע שלישי', [`${r.entry}-1`], r.entry],
  );
  assert.match(change.at, /^2026-10-30T/);
});

test('the Commander overrides the Status (after confirming); the override sticks against the agent', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const r = store.recordEntry(talkOf(tid, {
    changes: [{ trainee: tid, type: 'status', to: 'watch', reason: 'לא מגישה', evidence: ['#1'] }],
  }));
  const card = store.updateTrainee(tid, { status: { to: 'concern', reason: 'המפקד: דורשת טיפול', evidence: [`${r.entry}-1`] } });
  assert.equal(card.id, tid);
  assert.deepEqual([card.status.value, card.status.by], ['concern', 'commander']);
  const statuses = () => store.readTrainee(tid).changes.filter((c) => c.type === 'status').sort((a, b) => a.at.localeCompare(b.at));
  const change = statuses().at(-1);
  assert.deepEqual([change.from, change.to, change.by, change.evidence, change.entry], ['watch', 'concern', 'commander', [`${r.entry}-1`], undefined]);

  // The agent can no longer move it; it proposes instead.
  const TEXT = 'נועה הגישה הכל והייתה מצוינת';
  assert.throws(() => store.recordEntry({
    text: TEXT,
    evidence: [{ trainee: tid, kind: 'note', date: '2026-10-30', excerpt: TEXT }],
    changes: [{ trainee: tid, type: 'status', to: 'good', reason: 'הגישה הכל', evidence: ['#1'] }],
  }), /set by the Commander/);
  assert.equal(store.readTrainee(tid).evidence.length, 1, 'nothing written');

  // Accepting a proposal is another Commander change; a bare override cites no Evidence.
  assert.equal(store.updateTrainee(tid, { status: { to: 'good', reason: 'אישור הצעה: הגישה הכל' } }).status.value, 'good');
  assert.deepEqual(statuses().at(-1).evidence, []);
});

test('a Commander Status change is refused when it changes nothing, lacks a reason, cites what is not their Evidence, or the Trainee left', () => {
  const { store, id } = setUp();
  const [noa, dani] = [id['נועה'], id['דני']];
  const r = store.recordEntry(talkOf(noa));
  assert.throws(() => store.updateTrainee(noa, { status: { to: 'great', reason: 'x' } }), /one of good, watch, concern/);
  assert.throws(() => store.updateTrainee(noa, { status: { to: 'watch', reason: ' ' } }), /reason/);
  assert.throws(() => store.updateTrainee(dani, { status: { to: 'watch', reason: 'x', evidence: [`${r.entry}-1`] } }), /no Evidence of/);
  store.updateTrainee(noa, { status: { to: 'watch', reason: 'x' } });
  assert.throws(() => store.updateTrainee(noa, { status: { to: 'watch', reason: 'x' } }), /already watch/);
  store.updateTrainee(dani, { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר קורס' } });
  assert.throws(() => store.updateTrainee(dani, { status: { to: 'concern', reason: 'x' } }), /left/);
});

const EVAL = 'נועה עלתה היום לרף מקס, שיחה עם מפקד הקורס.';
const stageEntry = (tid, to, kind = 'evaluation-event') => ({
  text: EVAL,
  evidence: [{ trainee: tid, kind, date: '2026-10-30', excerpt: EVAL }],
  changes: [{ trainee: tid, type: 'stage', to, evidence: ['#1'] }],
});

test('the evaluation-process stage moves on the Commander\'s word: an evaluation-event Evidence plus a stage-change record', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const r = store.recordEntry(stageEntry(tid, 'רף מקס'));
  const { card, changes } = store.readTrainee(tid);
  assert.equal(card.evalStage, 'רף מקס');
  const change = changes.find((c) => c.type === 'stage');
  assert.deepEqual(
    [change.id, change.from, change.to, change.by, change.evidence, change.reason],
    [r.changes[0], null, 'רף מקס', 'commander', [`${r.entry}-1`], null],
  );
  // Leaving the process: back to no stage.
  const OUT = 'נועה סיימה את תהליך ההערכה, השתפרה מאוד.';
  store.recordEntry({
    text: OUT,
    evidence: [{ trainee: tid, kind: 'evaluation-event', date: '2026-10-30', excerpt: OUT }],
    changes: [{ trainee: tid, type: 'stage', to: null, reason: 'השתפרה', evidence: ['#1'] }],
  });
  assert.equal(store.readTrainee(tid).card.evalStage, null);
});

test('a stage change needs an evaluation-event Evidence of the same Entry, a known stage, and a move', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const older = store.recordEntry({ text: EVAL, evidence: [{ trainee: tid, kind: 'evaluation-event', date: '2026-10-29', excerpt: EVAL }] });
  assert.throws(() => store.recordEntry(stageEntry(tid, 'רף מקס', 'note')), /evaluation-event Evidence of this Entry/);
  assert.throws(() => store.recordEntry({ ...stageEntry(tid, 'רף מקס'), changes: [{ trainee: tid, type: 'stage', to: 'רף מקס', evidence: [`${older.entry}-1`] }] }), /evaluation-event Evidence of this Entry/);
  assert.throws(() => store.recordEntry(stageEntry(tid, 'רף גבוה')), /רף מקס, רף רמד, רף מפקד היחידה, הדחה/);
  assert.throws(() => store.recordEntry(stageEntry(tid, null)), /not in the evaluation process/);
  store.recordEntry(stageEntry(tid, 'רף מקס'));
  assert.throws(() => store.recordEntry(stageEntry(tid, 'רף מקס')), /already at רף מקס/);
  assert.equal(store.readTrainee(tid).evidence.length, 2, 'refused Entries write nothing');
});

test('the Snapshot is rewritten with the Entry and the latest one is on the card', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  store.recordEntry(talkOf(tid, { changes: [{ trainee: tid, type: 'snapshot', text: 'מתקשה בהגשות.' }] }));
  const r = store.recordEntry(talkOf(tid, { changes: [{ trainee: tid, type: 'snapshot', text: 'עדיין לא מגישה; בשיחה הבאה לבדוק למה.' }] }));
  const { card, changes } = store.readTrainee(tid);
  assert.equal(card.snapshot.text, 'עדיין לא מגישה; בשיחה הבאה לבדוק למה.');
  assert.match(card.snapshot.at, /^2026-10-30T/);
  const record = changes.find((c) => c.id === r.changes[0]);
  assert.deepEqual([record.type, record.by, record.entry], ['snapshot', 'agent', r.entry]);
  assert.throws(() => store.recordEntry(talkOf(tid, { changes: [{ trainee: tid, type: 'snapshot', text: ' ' }] })), /Snapshot needs its text/);
  assert.throws(() => store.recordEntry(talkOf(tid, { changes: [{ trainee: id['דני'], type: 'snapshot', text: 'x' }] })), /no Evidence in this Entry/);
});

const FEEDBACK = 'שיפור: להגיע בזמן לתרגולים. שימור: עוזרת לחברים בצוות.';
const feedbackOf = (tid, extra = {}) => ({
  text: FEEDBACK,
  evidence: [{ trainee: tid, kind: 'improve-keep', date: '2026-10-29', excerpt: FEEDBACK }],
  ...extra,
});

test('improve/keep items: the Commander\'s word-for-word, the agent\'s as its own; the card holds the active ones', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const r = store.recordEntry(feedbackOf(tid, {
    items: [
      { trainee: tid, kind: 'improve', text: 'להגיע בזמן לתרגולים', by: 'commander', from: '#1' },
      { trainee: tid, kind: 'keep', text: 'עוזרת לחברים בצוות', by: 'commander', from: '#1' },
      { trainee: tid, kind: 'improve', text: 'לתכנן את השבוע מראש', by: 'agent', from: '#1' },
    ],
  }));
  assert.deepEqual(r.items, [`${r.entry}-2`, `${r.entry}-3`, `${r.entry}-4`]);
  const { card, items } = store.readTrainee(tid);
  assert.deepEqual(card.items, [
    { id: `${r.entry}-2`, kind: 'improve', text: 'להגיע בזמן לתרגולים', by: 'commander', date: '2026-10-29' },
    { id: `${r.entry}-3`, kind: 'keep', text: 'עוזרת לחברים בצוות', by: 'commander', date: '2026-10-29' },
    { id: `${r.entry}-4`, kind: 'improve', text: 'לתכנן את השבוע מראש', by: 'agent', date: '2026-10-29' },
  ]);
  assert.deepEqual(items.find((i) => i.id === `${r.entry}-2`).from, `${r.entry}-1`);

  // Retired: off the card, kept in history.
  const DONE = 'נועה מגיעה בזמן כבר שבועיים, אפשר להוריד את זה.';
  store.recordEntry({
    text: DONE,
    evidence: [{ trainee: tid, kind: 'note', date: '2026-10-30', excerpt: DONE }],
    changes: [{ trainee: tid, type: 'retired', item: `${r.entry}-2`, by: 'commander', reason: 'מגיעה בזמן', evidence: ['#1'] }],
  });
  const after = store.readTrainee(tid);
  assert.deepEqual(after.card.items.map((i) => i.id), [`${r.entry}-3`, `${r.entry}-4`]);
  assert.equal(after.items.length, 3, 'the retired item stays stored');
});

test('items are refused when the Commander\'s are not word-for-word or the kind or author is unknown; the agent retires only its own', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const item = (over) => feedbackOf(tid, { items: [{ trainee: tid, kind: 'improve', text: 'להגיע בזמן לתרגולים', by: 'commander', from: '#1', ...over }] });
  assert.throws(() => store.recordEntry(item({ text: 'להגיע בזמן' + ' תמיד' })), /word-for-word/);
  assert.throws(() => store.recordEntry(item({ kind: 'fix' })), /improve or keep/);
  assert.throws(() => store.recordEntry(item({ by: 'trainee' })), /agent or commander/);
  assert.throws(() => store.recordEntry(item({ from: undefined })), /origin Evidence/);
  const r = store.recordEntry(item({}));
  const retire = (over) => talkOf(tid, { changes: [{ trainee: tid, type: 'retired', item: `${r.entry}-2`, by: 'agent', reason: 'כבר מגיעה בזמן', evidence: ['#1'], ...over }] });
  assert.throws(() => store.recordEntry(retire({})), /only on the Commander's word/);
  assert.throws(() => store.recordEntry(retire({ by: 'commander', item: 'x-1' })), /not an active improve\/keep item/);
  assert.throws(() => store.recordEntry(retire({ by: 'commander', reason: '' })), /reason/);
  store.recordEntry(retire({ by: 'commander' }));
  assert.throws(() => store.recordEntry(retire({ by: 'commander' })), /not an active improve\/keep item/);
});

test('an item taken from a sensitive part is kept with it and shows on the card as the marker', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const TEXT = 'דיברתי עם נועה. היא לא ישנה בגלל המצב בבית, לשמור על קשר עם ההורים.';
  const r = store.recordEntry({
    text: TEXT,
    evidence: [{
      trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: `דיברתי עם נועה. ${MARK}`,
      sensitive: [{ category: 'family', excerpt: 'היא לא ישנה בגלל המצב בבית, לשמור על קשר עם ההורים.' }],
    }],
    items: [{ trainee: tid, kind: 'keep', text: 'לשמור על קשר עם ההורים', by: 'commander', from: '#2' }],
  });
  const { card, items, sensitive } = store.readTrainee(tid);
  assert.deepEqual(card.items, [{ id: `${r.entry}-3`, kind: 'keep', text: MARK, by: 'commander', date: '2026-10-30' }]);
  assert.equal(items.length, 0);
  assert.equal(sensitive.find((s) => s.id === `${r.entry}-3`).record, 'item');
  assert.ok(!JSON.stringify(store.readTeam()).includes('ההורים'));
  // A Commander item from public Evidence may not quote the sensitive part.
  assert.throws(() => store.recordEntry({
    text: TEXT,
    evidence: [{
      trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: `דיברתי עם נועה. ${MARK}`,
      sensitive: [{ category: 'family', excerpt: 'היא לא ישנה בגלל המצב בבית, לשמור על קשר עם ההורים.' }],
    }],
    items: [{ trainee: tid, kind: 'keep', text: 'לשמור על קשר עם ההורים', by: 'commander', from: '#1' }],
  }), /sensitive part/);
});

test('"בטל" withdraws the Entry\'s Status, stage, Snapshot, items and retirements with it; rebuildCard agrees', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const first = store.recordEntry(feedbackOf(tid, {
    items: [{ trainee: tid, kind: 'improve', text: 'להגיע בזמן לתרגולים', by: 'commander', from: '#1' }],
    changes: [
      { trainee: tid, type: 'status', to: 'watch', reason: 'מאחרת', evidence: ['#1'] },
      { trainee: tid, type: 'snapshot', text: 'מאחרת, עוזרת לאחרים.' },
    ],
  }));
  const before = store.readTrainee(tid).card;
  store.recordEntry({
    ...stageEntry(tid, 'רף מקס'),
    items: [{ trainee: tid, kind: 'keep', text: 'שיחה עם מפקד הקורס', by: 'agent', from: '#1' }],
    changes: [
      { trainee: tid, type: 'stage', to: 'רף מקס', evidence: ['#1'] },
      { trainee: tid, type: 'status', to: 'concern', reason: 'נכנסה לתהליך הערכה', evidence: ['#1'] },
      { trainee: tid, type: 'snapshot', text: 'בתהליך הערכה.' },
      { trainee: tid, type: 'retired', item: `${first.entry}-2`, by: 'commander', reason: 'הוחלף', evidence: ['#1'] },
    ],
  });
  assert.deepEqual(
    [store.readTrainee(tid).card.evalStage, store.readTrainee(tid).card.status.value, store.readTrainee(tid).card.items.length],
    ['רף מקס', 'concern', 1],
  );
  store.retractEntry();
  const { card } = store.readTrainee(tid);
  assert.deepEqual(card, before);
  assert.deepEqual(store.rebuildCard(tid), { id: tid, ...before });
});

test('flipping an Evidence moves the improve/keep items taken from it', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const r = store.recordEntry(feedbackOf(tid, {
    items: [{ trainee: tid, kind: 'improve', text: 'להגיע בזמן לתרגולים', by: 'commander', from: '#1' }],
  }));
  const moved = store.flipSensitive(`${r.entry}-1`, { category: 'other' });
  assert.deepEqual(moved.moved, [`${r.entry}-1`, `${r.entry}-2`]);
  let noa = store.readTrainee(tid);
  assert.deepEqual([noa.items.length, noa.card.items[0].text], [0, MARK]);
  assert.equal(noa.sensitive.find((s) => s.id === `${r.entry}-2`).record, 'item');
  assert.throws(() => store.flipSensitive(`${r.entry}-2`), /improve\/keep item; flip the Evidence/);
  store.flipSensitive(`${r.entry}-1`);
  noa = store.readTrainee(tid);
  assert.deepEqual([noa.items.length, noa.card.items[0].text, noa.items[0].record], [1, 'להגיע בזמן לתרגולים', undefined]);
});

test('an Entry interrupted mid-write finishes with its state changes, once', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-data-'));
  let crash = true;
  const interrupt = (point) => { if (point === 'chunk' && crash) throw new Error('crash'); };
  const store = openStore({ dataDir, now: () => NOW, interrupt });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה'] });
  const [{ id: tid }] = store.readTeam();
  assert.throws(() => store.recordEntry(talkOf(tid, {
    changes: [{ trainee: tid, type: 'status', to: 'watch', reason: 'לא מגישה', evidence: ['#1'] }, { trainee: tid, type: 'snapshot', text: 'לא מגישה.' }],
  })), /crash/);
  assert.equal(store.readTrainee(tid).card.status, null);
  crash = false;
  store.resumePending();
  store.resumePending();
  const { card, changes } = store.readTrainee(tid);
  assert.deepEqual([card.status.value, card.snapshot.text], ['watch', 'לא מגישה.']);
  assert.equal(changes.filter((c) => c.type === 'status').length, 1);
});

test('text the agent writes for the card may not repeat a sensitive part of the Entry', () => {
  const { store, id } = setUp();
  const tid = id['נועה'];
  const TEXT = 'דיברתי עם נועה על הפרויקט. אמא שלה חולה מאוד.';
  const entry = (extra) => ({
    text: TEXT,
    evidence: [{
      trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: `דיברתי עם נועה על הפרויקט. ${MARK}`,
      sensitive: [{ category: 'family', excerpt: 'אמא שלה חולה מאוד.' }],
    }],
    ...extra,
  });
  const leak = 'מתקשה כי אמא שלה חולה מאוד';
  assert.throws(() => store.recordEntry(entry({ changes: [{ trainee: tid, type: 'snapshot', text: leak }] })), /sensitive part/);
  assert.throws(() => store.recordEntry(entry({ changes: [{ trainee: tid, type: 'status', to: 'watch', reason: leak, evidence: ['#1'] }] })), /sensitive part/);
  assert.throws(() => store.recordEntry(entry({ items: [{ trainee: tid, kind: 'improve', text: leak, by: 'agent', from: '#1' }] })), /sensitive part/);
  assert.throws(() => store.recordEntry(entry({ assessments: [{ trainee: tid, skill: 'learn.self-awareness', score: 3, author: 'agent', reason: leak, evidence: ['#1'] }] })), /sensitive part/);
  // Display-safe wording is fine.
  store.recordEntry(entry({ changes: [{ trainee: tid, type: 'snapshot', text: 'עובדת על הפרויקט; מצב אישי מורכב.' }] }));
  assert.equal(store.readTrainee(tid).card.snapshot.text, 'עובדת על הפרויקט; מצב אישי מורכב.');
});
