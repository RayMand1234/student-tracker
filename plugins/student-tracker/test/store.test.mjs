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

test('setup gives the Cycle its own copy of the shipped Course preset', () => {
  const { store } = freshStore();
  setUp(store);
  const { preset } = store.readCycle();
  assert.equal(preset.tests.find((t) => t.aliases.includes('פוב')).name, 'FOV');
  assert.equal(preset.schedule.length, 21);
});

const FOV = 'נועה עברה את פוב, היא אמרה שהיא חשבה שלא תעבור';

test('a test Evidence keeps the canonical Test, its Subject and self verdict, and no score unless given', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  store.recordEntry({
    text: FOV,
    evidence: [{ trainee: noa, kind: 'test', date: '2026-10-30', excerpt: FOV, subject: 'tabi', test: 'FOV', self: 'לא עובר' }],
  });
  const [ev] = store.readTrainee(noa).evidence;
  assert.deepEqual([ev.subject, ev.test, ev.score, ev.self, ev.unlisted], ['tabi', 'FOV', null, 'לא עובר', false]);

  const scored = 'דני קיבל 85 בפוב';
  store.recordEntry({
    text: scored,
    evidence: [{ trainee: idOf(store, 'דני'), kind: 'test', date: '2026-10-30', excerpt: scored, subject: 'tabi', test: 'FOV', score: 85 }],
  });
  assert.equal(store.readTrainee(idOf(store, 'דני')).evidence[0].score, 85);
});

test('a Test written by alias, or under the wrong Subject, is refused with the canonical name', () => {
  const { store } = freshStore();
  setUp(store);
  const ev = { trainee: idOf(store, 'נועה'), kind: 'test', date: '2026-10-30', excerpt: FOV, subject: 'tabi' };
  assert.throws(() => store.recordEntry({ text: FOV, evidence: [{ ...ev, test: 'פוב' }] }), /"FOV"/);
  assert.throws(() => store.recordEntry({ text: FOV, evidence: [{ ...ev, test: 'FOV', subject: 'oop' }] }), /tabi/);
  assert.equal(store.readTrainee(ev.trainee).evidence.length, 0);
});

test('a Test the preset does not list is kept as written only when flagged unlisted', () => {
  const { store } = freshStore();
  setUp(store);
  const text = 'נועה עשתה את תרץ קרוקודיל';
  const ev = { trainee: idOf(store, 'נועה'), kind: 'test', date: '2026-10-30', excerpt: text, test: 'קרוקודיל' };
  assert.throws(() => store.recordEntry({ text, evidence: [ev] }), /unlisted/);
  store.recordEntry({ text, evidence: [{ ...ev, unlisted: true }] });
  const [saved] = store.readTrainee(ev.trainee).evidence;
  assert.deepEqual([saved.test, saved.unlisted], ['קרוקודיל', true]);
});

test('a field that does not belong to the Evidence kind is refused', () => {
  const { store } = freshStore();
  setUp(store);
  const ev = { trainee: idOf(store, 'נועה'), kind: 'talk', date: '2026-10-30', excerpt: TALK };
  assert.throws(() => store.recordEntry({ text: TALK, evidence: [{ ...ev, score: 90 }] }), /field "score"/);
  assert.throws(() => store.recordEntry({ text: FOV, evidence: [{ ...ev, kind: 'test', excerpt: FOV, score: 'טוב' }] }), /score/);
});

const AGREED = 'דיברתי היום עם נועה על הדיבאג. סיכמנו שתשב עם דני על זה';

test('an Evidence opens Follow-ups word-for-word, and they show on the card until a later Evidence closes them', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  const { entry } = store.recordEntry({
    text: AGREED,
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: AGREED, followups: ['סיכמנו שתשב עם דני על זה'] }],
  });
  const opened = store.readTrainee(noa);
  assert.deepEqual(opened.followups.map((f) => [f.id, f.text, f.from, f.date]), [
    [`${entry}-2`, 'סיכמנו שתשב עם דני על זה', `${entry}-1`, '2026-10-30'],
  ]);
  assert.deepEqual(opened.card.followups, [{ id: `${entry}-2`, text: 'סיכמנו שתשב עם דני על זה', date: '2026-10-30' }]);

  const done = 'נועה ישבה עם דני על הדיבאג';
  const closing = store.recordEntry({
    text: done,
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-30', excerpt: done, closes: [`${entry}-2`] }],
  });
  const after = store.readTrainee(noa);
  assert.deepEqual(after.card.followups, []);
  assert.deepEqual(after.evidence.find((e) => e.id === `${closing.entry}-1`).closes, [`${entry}-2`]);
});

test('a Follow-up must be word-for-word, and only an open Follow-up of the same Trainee can be closed', () => {
  const { store } = freshStore();
  setUp(store);
  const [noa, dani] = [idOf(store, 'נועה'), idOf(store, 'דני')];
  const ev = { trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: AGREED };
  assert.throws(() => store.recordEntry({ text: AGREED, evidence: [{ ...ev, followups: ['לשבת עם דני'] }] }), /word-for-word/);
  const { entry } = store.recordEntry({ text: AGREED, evidence: [{ ...ev, followups: ['סיכמנו שתשב עם דני על זה'] }] });

  const note = 'דני עזר לה';
  const closeBy = (trainee) => ({ text: note, evidence: [{ trainee, kind: 'note', date: '2026-10-30', excerpt: note, closes: [`${entry}-2`] }] });
  assert.throws(() => store.recordEntry(closeBy(dani)), /open Follow-up/);
  store.recordEntry(closeBy(noa));
  assert.throws(() => store.recordEntry(closeBy(noa)), /open Follow-up/);
});

test('a correction is a clarification linked to the original Evidence, which stays as written', () => {
  const { store } = freshStore();
  setUp(store);
  const noa = idOf(store, 'נועה');
  const { evidence: [original] } = store.recordEntry({
    text: FOV,
    evidence: [{ trainee: noa, kind: 'test', date: '2026-10-30', excerpt: FOV, test: 'FOV' }],
  });
  const fix = 'טעות, נועה עברה את פליים ולא את פוב';
  const clar = { trainee: noa, kind: 'clarification', date: '2026-10-30', excerpt: fix };
  assert.throws(() => store.recordEntry({ text: fix, evidence: [clar] }), /clarifies/);
  assert.throws(() => store.recordEntry({ text: fix, evidence: [{ ...clar, clarifies: 'e-nope-1' }] }), /clarifies/);
  store.recordEntry({ text: fix, evidence: [{ ...clar, clarifies: original }] });

  const { evidence } = store.readTrainee(noa);
  assert.equal(evidence.find((e) => e.id === original).test, 'FOV');
  assert.equal(evidence.find((e) => e.kind === 'clarification').clarifies, original);
});

test('a Test the Commander confirms is added to this Cycle\'s preset copy, then recorded by its name', () => {
  const { store } = freshStore();
  setUp(store);
  const added = store.updateCycle({ addTest: { name: 'Crocodile', subject: 'oop', number: '4', aliases: ['קרוקודיל'] } });
  assert.equal(added.tests.at(-1).id, 'oop.crocodile');
  assert.equal(store.readCycle().preset.tests.find((t) => t.name === 'Crocodile').subject, 'oop');

  const text = 'נועה עשתה את קרוקודיל';
  store.recordEntry({ text, evidence: [{ trainee: idOf(store, 'נועה'), kind: 'test', date: '2026-10-30', excerpt: text, test: 'Crocodile' }] });
  assert.equal(store.readTrainee(idOf(store, 'נועה')).evidence[0].subject, 'oop');
});

test('adding a Test whose name or alias is already taken, or under an unknown Subject, is refused', () => {
  const { store } = freshStore();
  setUp(store);
  assert.throws(() => store.updateCycle({ addTest: { name: 'פוב', subject: 'tabi' } }), /FOV/);
  assert.throws(() => store.updateCycle({ addTest: { name: 'Crocodile', subject: 'zoo' } }), /Subject/);
  assert.throws(() => store.updateCycle({ renameCycle: 'x' }), /addTest/);
  assert.equal(store.readCycle().preset.tests.length, 21);
});
