// Briefs, team status and proactive alerts through the storage seam (ticket 25): the brief stores
// its refreshed next-Talk questions, readStatus gives the team lists, takeAlert gives one alert at
// a time and remembers what it showed today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function setUp({ names = ['נועה', 'דני'], start = '2026-09-10', talk } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-brief-'));
  let tick = 0;
  let clock = NOW.getTime();
  const store = openStore({ dataDir, now: () => new Date(clock + 1000 * tick++) });
  store.createCycle({ commander: { name: 'רז', talk }, cycle: { name: 'הצהובים', start }, trainees: names });
  store.finishSetup();
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  // Move the clock to another day (same time), for "once a day".
  const nextDay = (days = 1) => { clock += days * 86_400_000; };
  return { store, id, nextDay };
}

let n = 0;
function talk(store, tid, date, extra = {}) {
  const text = `דיברתי עם החניך, שיחה מספר ${++n}.`;
  return store.recordEntry({ text, evidence: [{ trainee: tid, kind: 'talk', date, excerpt: text }], ...extra });
}
function rate(store, tid, skill, score, date = '2026-10-29') {
  const text = `הערה על ${skill} מספר ${++n}`;
  store.recordEntry({
    text,
    evidence: [{ trainee: tid, kind: 'note', date, excerpt: text }],
    assessments: [{ trainee: tid, skill, score, author: 'agent', reason: 'סיבה', evidence: ['#1'] }],
  });
}

test('the brief stores its refreshed next-Talk questions, and the card (the dashboard) shows the same ones', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  talk(store, noa, '2026-10-21', { changes: [{ type: 'nextTalk', trainee: noa, questions: ['שאלה ישנה אחת?', 'שאלה ישנה שתיים?'] }] });

  const r = store.recordNextTalk(noa, ['מה עזר לך למצוא את הבאג לבד?', 'איך הולך בצוות של פאדנס?']);
  assert.match(r.change, /^c-20261030-0915-/);
  const { card, changes, entries } = store.readTrainee(noa);
  assert.deepEqual(card.nextTalk.questions, ['מה עזר לך למצוא את הבאג לבד?', 'איך הולך בצוות של פאדנס?']);
  assert.deepEqual(r.card.nextTalk, card.nextTalk);
  const record = changes.find((c) => c.id === r.change);
  assert.equal(record.type, 'nextTalk');
  assert.equal(record.entry, null);
  assert.equal(record.by, 'agent');
  assert.equal(entries.length, 1, 'a brief is not an Entry');
  assert.deepEqual(store.rebuildCard(noa).nextTalk, card.nextTalk, 'rebuilt from the record');
});

test('the brief\'s questions outlive a Retraction of the Entry before them', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  talk(store, noa, '2026-10-21', { changes: [{ type: 'nextTalk', trainee: noa, questions: ['שאלה ישנה אחת?', 'שאלה ישנה שתיים?'] }] });
  store.recordNextTalk(noa, ['שאלה חדשה אחת?', 'שאלה חדשה שתיים?']);
  store.retractEntry();
  assert.deepEqual(store.readTrainee(noa).card.nextTalk.questions, ['שאלה חדשה אחת?', 'שאלה חדשה שתיים?']);
});

test('the brief\'s questions are refused as an Entry\'s are: count, repeats, sensitive words, a Trainee who left', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const text = 'דיברתי עם נועה על הפרויקט. אמא שלה חולה מאוד בבית חולים.';
  store.recordEntry({
    text,
    evidence: [{
      trainee: noa, kind: 'talk', date: '2026-10-29', excerpt: `דיברתי עם נועה על הפרויקט. ${'[פרט אישי — בתיק]'}`,
      sensitive: [{ category: 'health', excerpt: 'אמא שלה חולה מאוד בבית חולים.' }],
    }],
  });
  const before = store.readTrainee(noa).card;
  assert.throws(() => store.recordNextTalk(noa, ['רק אחת?']), /two or three/);
  assert.throws(() => store.recordNextTalk(noa, ['אותה?', 'אותה?']), /twice/);
  assert.throws(() => store.recordNextTalk(noa, ['איך אמא שלה חולה?', 'מה עם הפרויקט?']), /sensitive/);
  assert.throws(() => store.recordNextTalk('t-nobody', ['א?', 'ב?']), /unknown Trainee/);
  assert.deepEqual(store.readTrainee(noa).card, before, 'nothing written');

  store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר קורס' } });
  assert.throws(() => store.recordNextTalk(id['דני'], ['א?', 'ב?']), /left/);
});

// The Commander's sample team (ticket 10): Talks against yellow 14 / red 21, two decliners, a
// weakness three share, two with nothing to flag, one who left.
function sampleTeam() {
  const t = setUp({ names: ['מאיה', 'אור', 'עידו', 'דני', 'נועה', 'אביגיל', 'יואב'], talk: { target: 7, yellow: 14, red: 21 } });
  const { store, id } = t;
  talk(store, id['אור'], '2026-10-08'); // 22 days
  talk(store, id['עידו'], '2026-10-14'); // 16 days
  talk(store, id['דני'], '2026-10-27');
  talk(store, id['נועה'], '2026-10-21'); // 9 days: under yellow
  talk(store, id['אביגיל'], '2026-10-29');
  rate(store, id['דני'], 'learn.diligence', 3, '2026-09-25');
  rate(store, id['דני'], 'learn.diligence', 1, '2026-10-28');
  rate(store, id['אור'], 'inter.communication', 4, '2026-09-20');
  rate(store, id['אור'], 'inter.communication', 3, '2026-10-25');
  rate(store, id['נועה'], 'impl.debugging', 2, '2026-09-20');
  rate(store, id['נועה'], 'impl.debugging', 3, '2026-10-28'); // up: not declining
  rate(store, id['דני'], 'learn.organization', 1);
  rate(store, id['אור'], 'learn.organization', 2);
  rate(store, id['עידו'], 'learn.organization', 2);
  rate(store, id['אביגיל'], 'learn.organization', 4);
  rate(store, id['יואב'], 'learn.organization', 1); // left: not counted
  store.updateTrainee(id['דני'], { status: { to: 'concern', reason: 'לא מגיש' } });
  const words = 'דני עולה לרף מקס.';
  store.recordEntry({
    text: words,
    evidence: [{ trainee: id['דני'], kind: 'evaluation-event', date: '2026-10-29', excerpt: words }],
    changes: [{ type: 'stage', trainee: id['דני'], to: 'רף מקס', evidence: ['#1'] }],
  });
  store.updateTrainee(id['יואב'], { leave: { date: '2026-10-01', how: 'transfer', reason: 'עבר קורס' } });
  return t;
}

const names = (xs) => xs.map((x) => x.name);

test('team status: who needs a Talk, who is declining, a shared weakness, and the rest on one line', () => {
  const { store, id } = sampleTeam();
  const before = store.readTeam();
  const s = store.readStatus();
  assert.equal(s.cycle, 'הצהובים');
  assert.equal(s.week, 8);
  assert.equal(s.active, 6);
  assert.deepEqual(s.needTalk, [
    { id: id['מאיה'], name: 'מאיה', days: null, level: null },
    { id: id['אור'], name: 'אור', days: 22, level: 'red' },
    { id: id['עידו'], name: 'עידו', days: 16, level: 'yellow' },
  ]);
  assert.deepEqual(s.declining, [
    { id: id['דני'], name: 'דני', drops: [{ skill: 'learn.diligence', name: 'שקדנות', from: 3, to: 1 }], status: 'concern', evalStage: 'רף מקס' },
    { id: id['אור'], name: 'אור', drops: [{ skill: 'inter.communication', name: 'תקשורת', from: 4, to: 3 }], status: null, evalStage: null },
  ]);
  assert.deepEqual(s.shared, [{
    skill: 'learn.organization',
    name: 'סדר וארגון',
    trainees: [{ id: id['דני'], name: 'דני', score: 1 }, { id: id['אור'], name: 'אור', score: 2 }, { id: id['עידו'], name: 'עידו', score: 2 }],
  }]);
  assert.deepEqual(s.fine, ['אביגיל', 'נועה']);
  assert.deepEqual(store.readTeam(), before, 'a read: nothing written');
});

test('team status: "בירידה" also takes a Trainee only in the evaluation process; shared weaknesses are two at most', () => {
  const { store, id } = setUp({ names: ['א', 'ב', 'ג'] });
  for (const tid of Object.values(id)) talk(store, tid, '2026-10-29');
  for (const skill of ['impl.debugging', 'inter.teamwork', 'learn.depth']) {
    for (const tid of Object.values(id)) rate(store, tid, skill, skill === 'learn.depth' ? 1 : 2);
  }
  const words = 'ב עולה לרף רמד.';
  store.recordEntry({
    text: words,
    evidence: [{ trainee: id['ב'], kind: 'evaluation-event', date: '2026-10-29', excerpt: words }],
    changes: [{ type: 'stage', trainee: id['ב'], to: 'רף רמד', evidence: ['#1'] }],
  });
  const s = store.readStatus();
  assert.deepEqual(s.needTalk, []);
  assert.deepEqual(names(s.declining), ['ב']);
  assert.deepEqual(s.declining[0].drops, []);
  // Lowest first when as many share them, then by Skill id.
  assert.deepEqual(s.shared.map((w) => w.skill), ['learn.depth', 'impl.debugging']);
  assert.deepEqual(s.fine, [], 'all three share a weakness: nobody has nothing to flag');
});

test('alerts come one per reply in priority: red Talk, shared weakness, pattern, yellow Talk; each once a day', () => {
  const { store, id, nextDay } = sampleTeam();
  const pattern = { trainee: id['נועה'], theme: 'הגישה באיחור פעם שלישית' };
  const first = store.takeAlert({ pattern });
  // Maya has had no Talk in the 50 days since the Cycle began: red, before Or's 22 days.
  assert.deepEqual(first.alert, { key: `talk:${id['מאיה']}`, kind: 'talk', level: 'red', trainee: id['מאיה'], name: 'מאיה', days: 50, noTalk: true });
  assert.equal(first.more, 4);
  assert.deepEqual(store.takeAlert({ pattern }).alert, { key: `talk:${id['אור']}`, kind: 'talk', level: 'red', trainee: id['אור'], name: 'אור', days: 22, noTalk: false });
  const weak = store.takeAlert({ pattern });
  assert.equal(weak.alert.kind, 'weakness');
  assert.equal(weak.alert.skill, 'learn.organization');
  assert.deepEqual(names(weak.alert.trainees), ['דני', 'אור', 'עידו']);
  const seen = store.takeAlert({ pattern });
  assert.equal(seen.alert.kind, 'pattern');
  assert.equal(seen.alert.theme, 'הגישה באיחור פעם שלישית');
  assert.equal(seen.more, 1);
  assert.deepEqual(store.takeAlert({ pattern }), { alert: { key: `talk:${id['עידו']}`, kind: 'talk', level: 'yellow', trainee: id['עידו'], name: 'עידו', days: 16, noTalk: false }, more: 0 });
  assert.deepEqual(store.takeAlert({ pattern }), { alert: null, more: 0 }, 'everything was shown today');
  assert.deepEqual(store.takeAlert(), { alert: null, more: 0 });

  // Tomorrow the overdue Talks and the pattern come back; the same shared weakness does not.
  nextDay();
  const kinds = [];
  for (let a = store.takeAlert({ pattern }); a.alert; a = store.takeAlert({ pattern })) kinds.push(a.alert.kind);
  assert.deepEqual(kinds, ['talk', 'talk', 'pattern', 'talk']);
});

test('a weakness shared by one more Trainee is news again; a Talk ends its alert', () => {
  const { store, id, nextDay } = sampleTeam();
  while (store.takeAlert().alert);
  nextDay();
  rate(store, id['אביגיל'], 'learn.organization', 2, '2026-10-30');
  talk(store, id['מאיה'], '2026-10-31');
  const seen = [];
  for (let a = store.takeAlert(); a.alert; a = store.takeAlert()) seen.push(a.alert);
  assert.deepEqual(seen.map((a) => a.name), ['אור', 'סדר וארגון', 'עידו']);
  assert.deepEqual(names(seen[1].trainees), ['דני', 'אביגיל', 'אור', 'עידו']);
});

test('the alert memory keeps no word of a pattern, and a pattern about an unknown Trainee is refused', () => {
  const { store, id } = sampleTeam();
  const root = store.connect().url.slice('local:'.length);
  const pattern = { trainee: id['נועה'], theme: 'בוכה בשיעורים' };
  while (store.takeAlert({ pattern }).alert);
  const memory = fs.readFileSync(path.join(root, 'meta/alerts.json'), 'utf8');
  assert.doesNotMatch(memory, /בוכה/);
  assert.match(memory, /pattern:/);
  assert.throws(() => store.takeAlert({ pattern: { trainee: 't-nobody', theme: 'x' } }), /unknown Trainee/);
  assert.throws(() => store.takeAlert({ pattern: { trainee: id['נועה'], theme: ' ' } }), /theme/);
});
