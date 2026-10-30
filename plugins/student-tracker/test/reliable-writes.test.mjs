import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { openDocs } from '../lib/docs.mjs';

const NOW = new Date('2026-10-30T09:15:00');
const TEXT = 'דיברתי היום עם נועה. אתמול ישבתי עם דני.';
const NOA = 'דיברתי היום עם נועה.';
const DANI = 'אתמול ישבתי עם דני.';

function setUp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-rw-'));
  const store = openStore({ dataDir, now: () => NOW });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const ids = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { dataDir, store, ids, with: (opts) => openStore({ dataDir, now: () => NOW, ...opts }) };
}

const talkTo = (ids) => ({
  text: TEXT,
  evidence: [
    { trainee: ids['נועה'], kind: 'talk', date: '2026-10-30', excerpt: NOA },
    { trainee: ids['דני'], kind: 'talk', date: '2026-10-29', excerpt: DANI },
  ],
});

test('an Entry interrupted after one of two chunks is finished by resumePending, with no duplicates', () => {
  const s = setUp();
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry(talkTo(s.ids)), /crash/);

  const [entry] = s.store.readTrainee(s.ids['נועה']).entries;
  assert.equal(entry.status, 'writing');
  assert.equal(s.store.readTrainee(s.ids['דני']).evidence.length, 0);

  assert.deepEqual(s.store.resumePending(), { finished: [entry.id] });

  const noa = s.store.readTrainee(s.ids['נועה']);
  const dani = s.store.readTrainee(s.ids['דני']);
  assert.deepEqual(noa.evidence.map((e) => e.excerpt), [NOA]);
  assert.deepEqual(dani.evidence.map((e) => [e.id, e.excerpt]), [[`${entry.id}-2`, DANI]]);
  assert.equal(noa.card.lastTalk, '2026-10-30');
  assert.equal(dani.card.lastTalk, '2026-10-29');
  assert.equal(dani.entries[0].status, 'done');

  assert.deepEqual(s.store.resumePending(), { finished: [] });
  assert.equal(s.store.readTrainee(s.ids['דני']).evidence.length, 1);
});

test('an Entry that crashed before any chunk is finished whole', () => {
  const s = setUp();
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk') throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry(talkTo(s.ids)), /crash/);
  assert.equal(s.store.readTrainee(s.ids['נועה']).evidence.length, 0);

  s.store.resumePending();

  assert.equal(s.store.readTrainee(s.ids['נועה']).card.lastTalk, '2026-10-30');
  assert.equal(s.store.readTrainee(s.ids['דני']).card.lastTalk, '2026-10-29');
});

test('a card changed by a racing write mid-chunk is rebuilt from sources, keeping both writes', () => {
  const s = setUp();
  const late = 'ביום ראשון דיברתי עם נועה';
  let raced = false;
  const racing = s.with({
    interrupt: (point, { trainee } = {}) => {
      if (point !== 'chunk' || trainee !== s.ids['נועה'] || raced) return;
      raced = true;
      s.store.recordEntry({ text: late, evidence: [{ trainee, kind: 'talk', date: '2026-10-25', excerpt: late }] });
    },
  });

  racing.recordEntry(talkTo(s.ids));

  const noa = s.store.readTrainee(s.ids['נועה']);
  assert.deepEqual(noa.evidence.map((e) => e.date).sort(), ['2026-10-25', '2026-10-30']);
  assert.equal(noa.card.lastTalk, '2026-10-30');
  assert.ok(noa.entries.every((e) => e.status === 'done'));
});

test('rebuildCard reproduces a corrupted or lost card from the records alone', () => {
  const s = setUp();
  s.store.recordEntry(talkTo(s.ids));
  const noaId = s.ids['נועה'];
  const before = s.store.readTrainee(noaId).card;

  const docs = openDocs(s.store.connect().url.slice('local:'.length));
  const card = docs.get(`trainees/${noaId}`);
  docs.batch([{ op: 'set', path: `trainees/${noaId}`, data: { ...card.data, name: '???', lastTalk: '1999-01-01' }, ifVersion: card.version }]);
  assert.deepEqual(s.store.rebuildCard(noaId), before);
  assert.deepEqual(s.store.readTrainee(noaId).card, before);

  const again = docs.get(`trainees/${noaId}`);
  docs.batch([{ op: 'delete', path: `trainees/${noaId}`, ifVersion: again.version }]);
  assert.deepEqual(s.store.rebuildCard(noaId), before);
});

test('an Entry too big for one Trainee chunk is refused before anything is written', () => {
  const s = setUp();
  const line = 'נועה שאלה שאלה';
  const evidence = Array.from({ length: 50 }, () => ({ trainee: s.ids['נועה'], kind: 'note', date: '2026-10-30', excerpt: line }));
  assert.throws(() => s.store.recordEntry({ text: line, evidence }), /split the Entry/);
  assert.equal(s.store.readTrainee(s.ids['נועה']).entries.length, 0);
});

test('two sessions finishing the same interrupted Entry at once both succeed, without duplicates', () => {
  const s = setUp();
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry(talkTo(s.ids)), /crash/);

  // Session B reads Dani's chunk, then session A finishes the whole Entry before B writes.
  let overtaken = false;
  const sessionB = s.with({
    interrupt: (point) => {
      if (point !== 'chunk' || overtaken) return;
      overtaken = true;
      s.store.resumePending();
    },
  });
  sessionB.resumePending();

  const dani = s.store.readTrainee(s.ids['דני']);
  assert.equal(dani.evidence.length, 1);
  assert.equal(dani.card.lastTalk, '2026-10-29');
  assert.equal(dani.entries[0].status, 'done');
});

test('an interrupted Entry with a sensitive part is finished by resumePending, the part still kept apart', () => {
  const s = setUp();
  const text = 'דיברתי היום עם נועה. אבא שלה חולה מאוד.';
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk') throw new Error('crash'); } });
  const entry = {
    text,
    evidence: [{
      trainee: s.ids['נועה'], kind: 'talk', date: '2026-10-30', excerpt: 'דיברתי היום עם נועה. [פרט אישי — בתיק]',
      sensitive: [{ category: 'health', excerpt: 'אבא שלה חולה מאוד.' }],
    }],
  };
  assert.throws(() => crashing.recordEntry(entry), /crash/);
  assert.deepEqual(s.store.readTrainee(s.ids['נועה']).sensitive, []);

  s.store.resumePending();
  const noa = s.store.readTrainee(s.ids['נועה']);
  assert.deepEqual(noa.sensitive.map((r) => r.excerpt), ['אבא שלה חולה מאוד.']);
  assert.deepEqual(noa.evidence.map((r) => r.excerpt), ['דיברתי היום עם נועה. [פרט אישי — בתיק]']);
  assert.equal(noa.card.lastTalk, '2026-10-30');
});

test('flipping an Evidence whose Entry is still being written finishes the Entry first, so a resume cannot bring it back', () => {
  const s = setUp();
  let chunks = 0;
  const crashing = s.with({ interrupt: (point) => { if (point === 'chunk-written' && ++chunks === 1) throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry(talkTo(s.ids)), /crash/);
  const [ev] = s.store.readTrainee(s.ids['נועה']).evidence;

  s.store.flipSensitive(ev.id, { category: 'health' });
  s.store.resumePending();
  const noa = s.store.readTrainee(s.ids['נועה']);
  assert.deepEqual(noa.evidence, []);
  assert.deepEqual(noa.sensitive.map((r) => r.id), [ev.id]);
  assert.equal(s.store.readTrainee(s.ids['דני']).evidence.length, 1, 'the rest of the Entry was finished');
  assert.equal(noa.entries[0].status, 'done');
});
