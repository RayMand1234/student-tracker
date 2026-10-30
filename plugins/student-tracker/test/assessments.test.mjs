// Assessments on the storage seam: written with their Entry or on their own, and the card's
// per-Skill list of counting Assessments the Rating is computed from (ticket 05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function setUp({ now = () => NOW } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-as-'));
  const store = openStore({ dataDir, now });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const ids = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { dataDir, store, noa: ids['נועה'], dani: ids['דני'] };
}

const TALK = 'דיברתי היום עם נועה, היא מצאה לבד את הבאג בלולאה אחרי שהוסיפה הדפסות';

test('an agent Assessment is written with its Entry, cites the Evidence, and joins the card', () => {
  const { store, noa } = setUp();
  const { entry, assessments } = store.recordEntry({
    text: TALK,
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: TALK }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'מצאה לבד באג עם הדפסות', evidence: ['#1'] }],
  });

  assert.deepEqual(assessments, [`${entry}-2`]);
  const { card, assessments: saved } = store.readTrainee(noa);
  assert.deepEqual(saved.map(({ id, entry: e, trainee, skill, score, author, reason, evidence, date, retracted }) => (
    { id, e, trainee, skill, score, author, reason, evidence, date, retracted })), [{
    id: `${entry}-2`, e: entry, trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent',
    reason: 'מצאה לבד באג עם הדפסות', evidence: [`${entry}-1`], date: '2026-10-30', retracted: false,
  }]);
  assert.match(saved[0].at, /^2026-10-30T09:15:00[+-]\d\d:\d\d$/);
  assert.deepEqual(card.skills, { 'impl.debugging': { a: [['2026-10-30', 3, 'agent']], n: 1 } });
});

test('an Assessment that is not a whole 1–5 by agent, Commander or Trainee, with a reason and Evidence of its Trainee, is refused', () => {
  const { store, noa, dani } = setUp();
  const agreed = `${TALK}. סיכמנו שתעזור לדני`;
  const { evidence: [earlier] } = store.recordEntry({
    text: 'דני ישב איתה', evidence: [{ trainee: dani, kind: 'note', date: '2026-10-29', excerpt: 'דני ישב איתה' }],
  });
  const entry = (a) => ({
    text: agreed,
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: agreed, followups: ['סיכמנו שתעזור לדני'] }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'מצאה לבד', evidence: ['#1'], ...a }],
  });

  assert.throws(() => store.recordEntry(entry({ score: 3.5 })), /whole number from 1 to 5/);
  assert.throws(() => store.recordEntry(entry({ score: 6 })), /whole number from 1 to 5/);
  assert.throws(() => store.recordEntry(entry({ score: '3' })), /whole number from 1 to 5/);
  assert.throws(() => store.recordEntry(entry({ author: 'system' })), /author/);
  assert.throws(() => store.recordEntry(entry({ author: 'trainee' })), /self-assessment/, 'a Trainee\'s own score comes from their form');
  assert.throws(() => store.recordEntry(entry({ reason: ' ' })), /reason/);
  assert.throws(() => store.recordEntry(entry({ evidence: [] })), /at least one Evidence/);
  assert.throws(() => store.recordEntry(entry({ skill: 'impl.typing' })), /unknown Skill/);
  assert.throws(() => store.recordEntry(entry({ trainee: 't-nope00' })), /unknown Trainee/);
  assert.throws(() => store.recordEntry(entry({ evidence: ['#2'] })), /Evidence of/, 'the Follow-up is no Evidence');
  assert.throws(() => store.recordEntry(entry({ evidence: ['#7'] })), /Evidence of/);
  assert.throws(() => store.recordEntry(entry({ evidence: [earlier] })), /Evidence of/, 'Dani\'s Evidence');
  assert.throws(() => store.recordEntry(entry({ trainee: dani })), /Evidence of/, 'this Entry\'s Evidence is Noa\'s');
  const twice = entry({});
  twice.assessments.push({ ...twice.assessments[0], score: 4 });
  assert.throws(() => store.recordEntry(twice), /twice/);

  assert.equal(store.readTrainee(noa).evidence.length, 0);
  assert.deepEqual(store.readTrainee(noa).card.skills, {});
});

test('an Assessment may cite earlier Evidence and a sensitive part, and is dated by the latest Evidence it cites', () => {
  const { store, noa } = setUp();
  const old = 'בשבוע שעבר נועה נתקעה שעה על באג';
  const { evidence: [earlier] } = store.recordEntry({ text: old, evidence: [{ trainee: noa, kind: 'note', date: '2026-10-22', excerpt: old }] });
  const text = 'ביום שני נועה פתרה באג לבד. היא סיפרה שאבא שלה בבית חולים.';
  const { entry, sensitive: [part] } = store.recordEntry({
    text,
    evidence: [{
      trainee: noa, kind: 'note', date: '2026-10-26', excerpt: 'ביום שני נועה פתרה באג לבד. [פרט אישי — בתיק]',
      sensitive: [{ category: 'family', excerpt: 'היא סיפרה שאבא שלה בבית חולים.' }],
    }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'משתפרת', evidence: [earlier, '#1', '#2'] }],
  });

  const [a] = store.readTrainee(noa).assessments;
  assert.deepEqual(a.evidence, [earlier, `${entry}-1`, part]);
  assert.equal(a.date, '2026-10-26');
  assert.deepEqual(store.readTrainee(noa).card.skills['impl.debugging'], { a: [['2026-10-26', 3, 'agent']], n: 3 });
});

const clock = { at: NOW };

// One Entry per call, each a minute after the last, holding a note and one Assessment citing it.
function assessor(store, noa, start = NOW) {
  let minute = 0;
  return (date, score, author, skill = 'impl.debugging') => {
    clock.at = new Date(start.getTime() + 60_000 * minute++);
    const text = `הערה על נועה ${minute}`;
    return store.recordEntry({
      text,
      evidence: [{ trainee: noa, kind: author === 'trainee' ? 'self-assessment' : 'note', date, excerpt: text }],
      assessments: [{ trainee: noa, skill, score, author, reason: 'סיבה', evidence: ['#1'] }],
    });
  };
}

test('once the Commander has assessed a Skill, later agent Assessments are kept but leave the card; a Trainee\'s never join it', () => {
  const { store, noa } = setUp({ now: () => clock.at });
  const assess = assessor(store, noa);
  assess('2026-10-01', 2, 'agent');
  assess('2026-10-05', 5, 'trainee');
  assess('2026-10-10', 4, 'commander');
  assess('2026-10-20', 2, 'agent');
  assess('2026-10-25', 3, 'commander');
  assess('2026-10-26', 5, 'trainee', 'inter.teamwork');

  const { card, assessments } = store.readTrainee(noa);
  assert.equal(assessments.length, 6, 'every Assessment is stored');
  assert.deepEqual(card.skills, {
    'impl.debugging': { a: [['2026-10-01', 2, 'agent'], ['2026-10-10', 4, 'commander'], ['2026-10-25', 3, 'commander']], n: 3 },
  });
});

test('the card lists Assessments by the day they rest on, so an older one logged late slots in behind', () => {
  const { store, noa } = setUp({ now: () => clock.at });
  const assess = assessor(store, noa);
  assess('2026-10-20', 3, 'agent');
  assess('2026-10-10', 2, 'agent');
  assess('2026-10-20', 4, 'agent');

  assert.deepEqual(store.readTrainee(noa).card.skills['impl.debugging'].a,
    [['2026-10-10', 2, 'agent'], ['2026-10-20', 3, 'agent'], ['2026-10-20', 4, 'agent']]);
});

test('a re-rate or an accepted proposal writes standalone Assessments: a-<stamp> ids, no Entry, dated today', () => {
  const { store, noa, dani } = setUp();
  const { evidence: [talk] } = store.recordEntry({ text: TALK, evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-21', excerpt: TALK }] });

  const { assessments: ids } = store.recordAssessments(noa, [
    { skill: 'impl.debugging', score: 4, author: 'agent', reason: 'מוצאת באגים לבד', evidence: [talk] },
    { skill: 'learn.independence', score: 4, author: 'commander', reason: 'אושרה הצעה', evidence: [talk] },
  ]);

  assert.equal(ids.length, 2);
  for (const id of ids) assert.match(id, /^a-20261030-0915-[a-z0-9]{2}$/);
  const { card, assessments } = store.readTrainee(noa);
  assert.deepEqual(assessments.map((a) => [a.id, a.entry, a.trainee, a.date, a.evidence]).sort(),
    ids.map((id) => [id, null, noa, '2026-10-30', [talk]]).sort());
  assert.deepEqual(card.skills['impl.debugging'], { a: [['2026-10-30', 4, 'agent']], n: 1 });
  assert.deepEqual(card.skills['learn.independence'], { a: [['2026-10-30', 4, 'commander']], n: 1 });

  assert.throws(() => store.recordAssessments(noa, []), /at least one Assessment/);
  assert.throws(() => store.recordAssessments(noa, [{ skill: 'impl.debugging', score: 4, author: 'agent', reason: 'x', evidence: ['#1'] }]), /Evidence of/);
  assert.throws(() => store.recordAssessments(dani, [{ skill: 'impl.debugging', score: 4, author: 'agent', reason: 'x', evidence: [talk] }]), /Evidence of/);
  assert.equal(store.readTrainee(noa).assessments.length, 2);
});

test('rebuildCard restores the Skills from the Assessment records, and an interrupted Entry\'s Assessments are finished by resumePending', () => {
  const { dataDir, store, noa, dani } = setUp();
  const text = 'נועה ודני ישבו יחד על הבאג ופתרו אותו';
  let chunks = 0;
  const crashing = openStore({ dataDir, now: () => NOW,
    interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry({
    text,
    evidence: [
      { trainee: noa, kind: 'note', date: '2026-10-30', excerpt: text },
      { trainee: dani, kind: 'note', date: '2026-10-30', excerpt: text },
    ],
    assessments: [
      { trainee: noa, skill: 'inter.teamwork', score: 4, author: 'agent', reason: 'עבדה יחד', evidence: ['#1'] },
      { trainee: dani, skill: 'inter.teamwork', score: 4, author: 'agent', reason: 'עבד יחד', evidence: ['#2'] },
    ],
  }), /crash/);
  assert.deepEqual(store.readTrainee(dani).card.skills, {});

  store.resumePending();
  for (const tid of [noa, dani]) {
    assert.deepEqual(store.readTrainee(tid).card.skills, { 'inter.teamwork': { a: [['2026-10-30', 4, 'agent']], n: 1 } });
    assert.deepEqual(store.rebuildCard(tid).skills, store.readTrainee(tid).card.skills);
  }
});
