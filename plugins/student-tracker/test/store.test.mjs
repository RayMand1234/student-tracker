import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function freshStore() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-data-'));
  return { dataDir, store: openStore({ dataDir, now: () => NOW }) };
}

function setUp(store, trainees = ['נועה', 'דני']) {
  return store.createCycle({
    commander: { name: 'רז' },
    cycle: { name: 'הצהובים' },
    trainees,
  });
}

test('connect before setup tells the Commander to run setup', () => {
  const { store } = freshStore();
  assert.throws(() => store.connect(), /עוד לא הוקם מעקב — הרץ `\/student-tracker:setup`/);
});

test('a created Cycle is found by connect and read back by readCycle', () => {
  const { store } = freshStore();
  setUp(store);

  const conn = store.connect();
  assert.equal(conn.backend, 'local');
  assert.equal(conn.cycle, 'הצהובים');

  const { cycle, skills, commander } = store.readCycle();
  assert.equal(cycle.name, 'הצהובים');
  assert.equal(cycle.start, '2026-10-30');
  assert.equal(cycle.setup, 'done');
  assert.equal(cycle.schema, 1);
  assert.equal(cycle.archived, false);
  assert.equal(commander.settings.name, 'רז');
  assert.deepEqual(commander.settings.talk, { target: 10, yellow: 10, red: 14 });
  assert.ok(skills.groups.some((g) => g.skills.some((s) => s.id === 'impl.debugging')));
});

test('setup seeds one card per Trainee, keyed by a t-<rand6> id, never the name', () => {
  const { store } = freshStore();
  setUp(store);

  const team = store.readTeam();
  assert.deepEqual(team.map((t) => t.name).sort(), ['דני', 'נועה']);
  for (const card of team) {
    assert.match(card.id, /^t-[a-z0-9]{6}$/);
    assert.equal(card.active, true);
    assert.equal(card.lastTalk, null);
  }
});

test('setup refuses two Trainees with the same display name', () => {
  const { store } = freshStore();
  assert.throws(() => setUp(store, ['נועה', 'נועה']), /distinguishing label/);
  assert.throws(() => store.connect(), /הרץ/);
});

const TALK = 'דיברתי היום עם נועה, היא מרגישה שהדיבאג משתפר אבל עדיין נתקעת בהבנת הדרישה';

function idOf(store, name) {
  return store.readTeam().find((t) => t.name === name).id;
}

test('logging a Talk keeps the Entry word-for-word and cuts one Talk Evidence for that Trainee', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');

  const { entry } = store.recordEntry({
    text: TALK,
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: TALK }],
  });
  assert.match(entry, /^e-20261030-0915-[a-z0-9]{2}$/);

  const { card, evidence, entries } = store.readTrainee(noa);
  assert.equal(card.lastTalk, '2026-10-30');
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].id, `${entry}-1`);
  assert.equal(evidence[0].kind, 'talk');
  assert.equal(evidence[0].excerpt, TALK);
  assert.equal(evidence[0].date, '2026-10-30');
  assert.equal(evidence[0].retracted, false);
  assert.match(evidence[0].at, /^2026-10-30T09:15:00[+-]\d\d:\d\d$/);
  assert.deepEqual(entries.map((e) => [e.id, e.text, e.status]), [[entry, TALK, 'done']]);

  assert.equal(store.readTrainee(idOf(store, 'דני')).evidence.length, 0);
});

test('an excerpt that is not word-for-word from the Entry is refused and nothing is written', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');

  assert.throws(
    () => store.recordEntry({
      text: TALK,
      evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: 'נועה מרגישה שהדיבאג משתפר' }],
    }),
    /word-for-word/,
  );
  const { card, evidence, entries } = store.readTrainee(noa);
  assert.equal(card.lastTalk, null);
  assert.equal(evidence.length, 0);
  assert.equal(entries.length, 0);
});

test('Evidence for an unknown Trainee or kind is refused', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  const ev = { trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: TALK };

  assert.throws(() => store.recordEntry({ text: TALK, evidence: [{ ...ev, trainee: 't-nope00' }] }), /unknown Trainee/);
  assert.throws(() => store.recordEntry({ text: TALK, evidence: [{ ...ev, kind: 'chat' }] }), /unknown kind/);
  assert.throws(() => store.recordEntry({ text: TALK, evidence: [{ ...ev, date: 'היום' }] }), /date/);
});

test('an older Talk logged late does not move the last Talk date back', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  store.recordEntry({ text: TALK, evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: TALK }] });
  const late = 'שכחתי לרשום: ביום שני דיברתי עם נועה';
  store.recordEntry({ text: late, evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-26', excerpt: late }] });

  const { card, evidence } = store.readTrainee(noa);
  assert.equal(card.lastTalk, '2026-10-30');
  assert.equal(evidence.length, 2);
});

test('readTrainee since a date returns only Evidence that happened from then on', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  const old = 'בספטמבר דיברתי עם נועה';
  store.recordEntry({ text: old, evidence: [{ trainee: noa, kind: 'talk', date: '2026-09-01', excerpt: old }] });
  store.recordEntry({ text: TALK, evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: TALK }] });

  const { evidence } = store.readTrainee(noa, { since: '2026-10-01' });
  assert.deepEqual(evidence.map((e) => e.date), ['2026-10-30']);
});

test('setup over a finished Cycle is refused', () => {
  const { store } = freshStore();
  setUp(store);
  assert.throws(() => setUp(store, ['מאיה']), /כבר קיים מעקב למחזור הצהובים/);
  assert.equal(store.readTeam().length, 2);
});

test('re-running an interrupted setup resumes into the same store without duplicating Trainees', () => {
  const { dataDir } = freshStore();
  const crashing = openStore({ dataDir, now: () => NOW, interrupt: (point) => { if (point === 'seeded') throw new Error('crash'); } });
  assert.throws(() => setUp(crashing), /crash/);
  const store = openStore({ dataDir, now: () => NOW });
  const { url } = store.connect();
  assert.equal(store.connect().setup, 'in-progress');

  const again = setUp(store, ['נועה', 'דני', 'מאיה']);

  assert.equal(again.url, url);
  assert.equal(store.readCycle().cycle.setup, 'done');
  assert.deepEqual(store.readTeam().map((t) => t.name).sort(), ['דני', 'מאיה', 'נועה']);
});

test('an Entry with no Evidence is refused', () => {
  const { store } = freshStore();
  setUp(store);
  assert.throws(() => store.recordEntry({ text: TALK, evidence: [] }), /at least one Evidence/);
});
