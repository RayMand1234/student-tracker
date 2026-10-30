// Retraction ("בטל"): a withdrawn Entry stops counting and showing, and stays stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const MARK = '[פרט אישי — בתיק]';
let minute = 0;

function setUp(options = {}) {
  minute = 0;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-retract-'));
  const clock = () => new Date(`2026-10-30T09:${String(minute++).padStart(2, '0')}:00`);
  const store = openStore({ dataDir, now: clock, ...options });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id, with: (opts) => openStore({ dataDir, now: clock, ...opts }) };
}

const talk = (tid, date, excerpt, more = {}) => ({ trainee: tid, kind: 'talk', date, excerpt, ...more });

test('"בטל" retracts the last Entry: every record cut from it is flagged, kept word-for-word, and stops showing', () => {
  const { store, id } = setUp();
  const first = 'דיברתי עם נועה ביום שני.';
  store.recordEntry({ text: first, evidence: [talk(id['נועה'], '2026-10-26', first)] });
  const text = 'דיברתי היום עם נועה. סיכמנו שתשב עם דני. דני עזר לה.';
  const logged = store.recordEntry({
    text,
    evidence: [
      talk(id['נועה'], '2026-10-30', 'דיברתי היום עם נועה. סיכמנו שתשב עם דני.', { followups: ['סיכמנו שתשב עם דני.'] }),
      { trainee: id['דני'], kind: 'note', date: '2026-10-30', excerpt: 'דני עזר לה.' },
    ],
    assessments: [{ trainee: id['דני'], skill: 'inter.teamwork', score: 4, author: 'agent', reason: 'עזר לה', evidence: ['#2'] }],
  });

  const out = store.retractEntry();
  assert.deepEqual(out.entry, logged.entry);
  assert.deepEqual(out.trainees.sort(), [id['נועה'], id['דני']].sort());

  const noa = store.readTrainee(id['נועה']);
  assert.deepEqual(noa.evidence.map((e) => e.excerpt), [first], 'only the earlier Talk shows');
  assert.deepEqual(noa.followups, []);
  assert.deepEqual(noa.entries.map((e) => e.text), [first]);
  assert.equal(noa.card.lastTalk, '2026-10-26');
  assert.deepEqual(noa.card.followups, []);
  const dani = store.readTrainee(id['דני']);
  assert.deepEqual([dani.evidence, dani.assessments], [[], []]);
  assert.deepEqual(dani.card.skills, {});

  // Still stored, flagged, content untouched.
  const kept = store.readTrainee(id['נועה'], { retracted: true });
  const entry = kept.entries.find((e) => e.id === logged.entry);
  assert.equal(entry.text, text);
  assert.deepEqual(Object.keys(entry.retracted), ['at']);
  assert.match(entry.retracted.at, /^2026-10-30T09:\d\d:00[+-]\d\d:\d\d$/);
  assert.equal(entry.retraction, 'done');
  const withdrawn = kept.evidence.find((e) => e.entry === logged.entry);
  assert.equal(withdrawn.retracted, true);
  assert.equal(withdrawn.excerpt, 'דיברתי היום עם נועה. סיכמנו שתשב עם דני.');
  assert.deepEqual(kept.followups.map((f) => [f.text, f.retracted]), [['סיכמנו שתשב עם דני.', true]]);
  const daniKept = store.readTrainee(id['דני'], { retracted: true });
  assert.deepEqual(daniKept.assessments.map((a) => [a.score, a.retracted]), [[4, true]]);
});

test('Ratings recompute without a retracted Entry\'s Assessments, across the shared fixture table', async (t) => {
  const { RATING_FIXTURES, TODAY } = await import('./fixtures/ratings.mjs');
  const { rating } = await import('../dashboard/derive.mjs');
  for (const { name, assessments, expect } of RATING_FIXTURES) {
    await t.test(name, () => {
      const { store, id } = setUp();
      const noa = id['נועה'];
      const note = (text, date, score, author) => store.recordEntry({
        text,
        evidence: [{ trainee: noa, kind: author === 'trainee' ? 'self-assessment' : 'note', date, excerpt: text }],
        assessments: [{ trainee: noa, skill: 'impl.debugging', score, author, reason: 'סיבה', evidence: ['#1'] }],
      });
      assessments.forEach(([date, score, author], i) => note(`הערה ${i + 1}`, date, score, author));
      note('טעות: הדיבאג שלה זה 1', TODAY, 1, 'commander');

      store.retractEntry();
      const r = rating(store.readTrainee(noa).card.skills['impl.debugging'], TODAY);
      assert.deepEqual(r && { score: r.score, author: r.author, trend: r.trend, stale: r.stale }, expect);
    });
  }
});

test('an earlier Entry is retracted by naming it; a Follow-up it closed opens again', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const opened = store.recordEntry({
    text: 'דיברתי עם נועה. לבדוק שסיימה את התרץ.',
    evidence: [talk(noa, '2026-10-20', 'דיברתי עם נועה. לבדוק שסיימה את התרץ.', { followups: ['לבדוק שסיימה את התרץ.'] })],
  });
  const [fid] = opened.followups;
  const closing = store.recordEntry({
    text: 'נועה סיימה את התרץ.',
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-25', excerpt: 'נועה סיימה את התרץ.', closes: [fid] }],
  });
  store.recordEntry({ text: 'דיברתי עם נועה שוב.', evidence: [talk(noa, '2026-10-28', 'דיברתי עם נועה שוב.')] });
  assert.deepEqual(store.readTrainee(noa).card.followups, []);

  assert.equal(store.retractEntry(closing.entry).entry, closing.entry);
  const after = store.readTrainee(noa);
  assert.deepEqual(after.card.followups.map((f) => f.id), [fid]);
  assert.equal(after.card.lastTalk, '2026-10-28', 'the later Talk still counts');
  assert.deepEqual(after.entries.map((e) => e.id).includes(closing.entry), false);
});

test('a retracted Entry is refused a second Retraction, and an unknown id is refused', () => {
  const { store, id } = setUp();
  assert.throws(() => store.retractEntry(), /nothing has been recorded/);
  const text = 'דיברתי עם נועה.';
  const { entry } = store.recordEntry({ text, evidence: [talk(id['נועה'], '2026-10-30', text)] });
  store.retractEntry();
  assert.throws(() => store.retractEntry(), /already retracted/);
  assert.throws(() => store.retractEntry(entry), /already retracted/);
  assert.throws(() => store.retractEntry('e-20261030-0000-zz'), /no Entry/);
});

test('retracted records can no longer be cited, clarified, closed or flipped', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const text = 'דיברתי עם נועה. לבדוק שסיימה.';
  const old = store.recordEntry({ text, evidence: [talk(noa, '2026-10-29', text, { followups: ['לבדוק שסיימה.'] })] });
  store.retractEntry();
  const [ev] = old.evidence;
  const [fid] = old.followups;
  const later = 'נועה סיימה.';
  const base = { trainee: noa, date: '2026-10-30', excerpt: later };

  assert.throws(() => store.recordEntry({ text: later, evidence: [{ ...base, kind: 'clarification', clarifies: ev }] }), /clarifies/);
  assert.throws(() => store.recordEntry({ text: later, evidence: [{ ...base, kind: 'note', closes: [fid] }] }), /not an open Follow-up/);
  assert.throws(() => store.recordEntry({
    text: later,
    evidence: [{ ...base, kind: 'note' }],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 3, author: 'agent', reason: 'סיבה', evidence: [ev] }],
  }), /no Evidence/);
  assert.throws(() => store.recordAssessments(noa, [{ skill: 'impl.debugging', score: 3, author: 'agent', reason: 'סיבה', evidence: [ev] }]), /no Evidence/);
  assert.throws(() => store.flipSensitive(ev, { category: 'health' }), /retracted/);
});

test('sensitive records are retracted too, including one a flip moved', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const family = 'אמא שלה בבית חולים.';
  const text = `דיברתי עם נועה. ${family} היא סיימה את התרץ.`;
  const logged = store.recordEntry({
    text,
    evidence: [
      talk(noa, '2026-10-30', `דיברתי עם נועה. ${MARK}`, { sensitive: [{ category: 'family', excerpt: family }] }),
      { trainee: noa, kind: 'note', date: '2026-10-30', excerpt: 'היא סיימה את התרץ.' },
    ],
  });
  store.flipSensitive(logged.evidence[1], { category: 'other' });
  assert.equal(store.readTrainee(noa).sensitive.length, 2);

  store.retractEntry();
  const after = store.readTrainee(noa);
  assert.deepEqual([after.evidence, after.sensitive], [[], []]);
  assert.equal(after.card.lastTalk, null, 'a retracted sensitive-only Talk no longer counts either');
  const kept = store.readTrainee(noa, { retracted: true });
  assert.deepEqual(kept.sensitive.map((s) => [s.excerpt, s.retracted]).sort(), [[family, true], ['היא סיימה את התרץ.', true]]);
});

test('a Retraction interrupted after one of two Trainees is finished by resumePending', () => {
  const s = setUp();
  const text = 'דיברתי עם נועה. דני עזר לה.';
  const { entry } = s.store.recordEntry({
    text,
    evidence: [talk(s.id['נועה'], '2026-10-30', 'דיברתי עם נועה.'), talk(s.id['דני'], '2026-10-30', 'דני עזר לה.')],
  });
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'withdrawn' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.retractEntry(), /crash/);
  const stored = s.store.readTrainee(s.id['דני'], { retracted: true }).entries[0];
  assert.equal(stored.retraction, 'writing');
  assert.equal(s.store.readTrainee(s.id['נועה']).entries.length + s.store.readTrainee(s.id['דני']).entries.length, 0, 'already withdrawn');

  assert.deepEqual(s.store.resumePending(), { finished: [entry] });
  for (const name of ['נועה', 'דני']) {
    const t = s.store.readTrainee(s.id[name]);
    assert.deepEqual([t.evidence, t.card.lastTalk], [[], null], name);
  }
  assert.equal(s.store.readTrainee(s.id['דני'], { retracted: true }).entries[0].retraction, 'done');
  assert.deepEqual(s.store.resumePending(), { finished: [] });
});

test('retracting an Entry still being written finishes it first, so a resume cannot bring its records back', () => {
  const s = setUp();
  const text = 'דיברתי עם נועה. דני עזר לה.';
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry({
    text,
    evidence: [talk(s.id['נועה'], '2026-10-30', 'דיברתי עם נועה.'), talk(s.id['דני'], '2026-10-30', 'דני עזר לה.')],
  }), /crash/);

  s.store.retractEntry();
  s.store.resumePending();
  for (const name of ['נועה', 'דני']) {
    assert.deepEqual(s.store.readTrainee(s.id[name]).evidence, [], name);
    assert.equal(s.store.readTrainee(s.id[name], { retracted: true }).evidence.length, 1, name);
  }
});

test('hardDelete removes an Entry and everything cut from it, sensitive records included, and rebuilds the cards', () => {
  const { store, id } = setUp();
  const noa = id['נועה'];
  const keep = 'דיברתי עם נועה ביום שני.';
  store.recordEntry({ text: keep, evidence: [talk(noa, '2026-10-26', keep)] });
  const family = 'אמא שלה בבית חולים.';
  const text = `דיברתי היום עם נועה. ${family}`;
  const { entry } = store.recordEntry({
    text,
    evidence: [talk(noa, '2026-10-30', `דיברתי היום עם נועה. ${MARK}`, { sensitive: [{ category: 'family', excerpt: family }] })],
    assessments: [{ trainee: noa, skill: 'impl.debugging', score: 2, author: 'agent', reason: 'סיבה', evidence: ['#1'] }],
  });
  assert.throws(() => store.hardDelete(), /needs the id/);

  assert.deepEqual(store.hardDelete(entry).entry, entry);
  const all = store.readTrainee(noa, { retracted: true });
  assert.deepEqual(all.entries.map((e) => e.text), [keep]);
  assert.deepEqual(all.evidence.map((e) => e.excerpt), [keep]);
  assert.deepEqual([all.sensitive, all.assessments], [[], []]);
  assert.equal(all.card.lastTalk, '2026-10-26');
  assert.deepEqual(all.card.skills, {});
  assert.throws(() => store.hardDelete(entry), /no Entry/);
});

test('a hard delete interrupted mid-way is finished by resumePending; a retracted Entry can be deleted too', () => {
  const s = setUp();
  const text = 'דיברתי עם נועה. דני עזר לה.';
  const { entry } = s.store.recordEntry({
    text,
    evidence: [talk(s.id['נועה'], '2026-10-30', 'דיברתי עם נועה.'), talk(s.id['דני'], '2026-10-30', 'דני עזר לה.')],
  });
  s.store.retractEntry();
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'withdrawn' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.hardDelete(entry), /crash/);

  assert.deepEqual(s.store.resumePending(), { finished: [entry] });
  for (const name of ['נועה', 'דני']) {
    const t = s.store.readTrainee(s.id[name], { retracted: true });
    assert.deepEqual([t.entries, t.evidence], [[], []], name);
  }
});

test('a hard delete that overtakes a session mid-chunk is not undone by that session', () => {
  const s = setUp();
  const text = 'דיברתי עם נועה. דני עזר לה.';
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry({
    text,
    evidence: [talk(s.id['נועה'], '2026-10-30', 'דיברתי עם נועה.'), talk(s.id['דני'], '2026-10-30', 'דני עזר לה.')],
  }), /crash/);
  const [{ id: entry }] = s.store.readTrainee(s.id['נועה']).entries;

  // Session B reads Dani's missing records, then session A finishes the Entry and deletes it before B writes.
  let overtaken = false;
  const sessionB = s.with({
    interrupt: (point) => {
      if (point !== 'chunk' || overtaken) return;
      overtaken = true;
      s.store.hardDelete(entry);
    },
  });
  sessionB.resumePending();

  for (const name of ['נועה', 'דני']) {
    const t = s.store.readTrainee(s.id[name], { retracted: true });
    assert.deepEqual([t.entries, t.evidence, t.card.lastTalk], [[], [], null], name);
  }
});
