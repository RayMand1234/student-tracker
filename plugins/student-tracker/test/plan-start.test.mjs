// A turn's first step on the artifact backend (lean-turns 07): one read message covers connect,
// resumePending, readCycle and readTeam, and `plan start` gives what the local `start` gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { MissingReads } from '../lib/docs.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';

const URL = 'https://claude.ai/artifact/current';
const PREVIOUS = 'https://claude.ai/artifact/previous';

function pointerFile(p) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-start-')), 'cycles.json');
  fs.writeFileSync(file, JSON.stringify(p));
  return file;
}

// Plans start over `root` as the model would, fetching "missing reads" too.
function planStart(root, pointer) {
  const reads = readsFor({ op: 'start' });
  for (let round = 0; round < 4; round++) {
    const s = fetchReads(root, reads);
    try {
      return planOperation({ snapshot: s.dir, versions: s.versions, out: planDir(), op: 'start', pointer, now: () => NOW, rand: seededRand(3) });
    } catch (e) {
      if (!(e instanceof MissingReads)) throw e;
      reads.push(...e.reads);
    }
  }
  throw new Error('start kept asking for reads');
}

test('plan start gives connect, resumePending, the Cycle and the team, as the local start does', () => {
  const { dataDir, root } = fixture();
  const local = runOperation(openStore({ dataDir, now: () => NOW }), 'start');
  const planned = planStart(root, pointerFile({ current: URL, archived: [] }));
  assert.deepEqual(planned.batches, []);
  assert.deepEqual(planned.result.connect, { backend: 'artifact', url: URL, cycle: 'הצהובים', setup: 'done' });
  const { connect: _, ...rest } = planned.result;
  const { connect: __, ...localRest } = local;
  assert.deepEqual(rest, localRest);
});

test('plan start finishes an Entry an earlier session left half-written', () => {
  const { dataDir, root, id } = fixture(['נועה', 'דני']);
  let chunks = 0;
  const dying = openStore({ dataDir, now: () => NOW, rand: seededRand(5), interrupt: (p) => { if (p === 'chunk-written' && ++chunks === 1) throw new Error('died'); } });
  assert.throws(() => dying.recordEntry({
    text: 'דיברתי עם נועה. ישבתי עם דני.',
    evidence: [
      { trainee: id['נועה'], kind: 'talk', date: '2026-10-30', excerpt: 'דיברתי עם נועה.' },
      { trainee: id['דני'], kind: 'talk', date: '2026-10-30', excerpt: 'ישבתי עם דני.' },
    ],
  }), /died/);
  const planned = planStart(root, pointerFile({ current: URL, archived: [] }));
  assert.equal(planned.result.resumePending.finished.length, 1);
  applyPlan(root, planned.batches);
  const after = openStore({ dataDir });
  assert.equal(after.readTrainee(id['דני']).card.lastTalk, '2026-10-30');
  assert.equal(planned.result.team.find((t) => t.id === id['דני']).lastTalk, '2026-10-30', 'the team is read after resuming');
});

test('plan start: no Cycle seeded yet is a setup in progress; an archived one is not resumed; a missing previous joins archived', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'st-start-empty-'));
  const fresh = planStart(empty, pointerFile({ current: URL, archived: [] }));
  assert.deepEqual(fresh.result, { connect: { backend: 'artifact', url: URL, cycle: null, setup: 'in-progress' } });

  const { root } = fixture();
  const meta = path.join(root, 'meta/cycle.json');
  const doc = JSON.parse(fs.readFileSync(meta, 'utf8'));
  fs.writeFileSync(meta, JSON.stringify({ ...doc, data: { ...doc.data, previous: PREVIOUS } }));
  const mended = planStart(root, pointerFile({ current: URL, archived: [] }));
  assert.deepEqual(mended.pointer, { current: URL, archived: [PREVIOUS] });

  fs.writeFileSync(meta, JSON.stringify({ ...doc, data: { ...doc.data, archived: true } }));
  const archived = planStart(root, pointerFile({ current: URL, archived: [] }));
  assert.equal(archived.result.connect.archived, true);
  assert.equal(archived.result.resumePending, undefined);
});

test('plan start needs the pointer', () => {
  const { root } = fixture();
  const s = fetchReads(root, readsFor({ op: 'start' }));
  assert.throws(() => planOperation({ snapshot: s.dir, versions: s.versions, out: planDir(), op: 'start' }), /--pointer/);
});

test('start: without any one read of its manifest, planning refuses and names it', () => {
  const { root } = fixture();
  const pointer = pointerFile({ current: URL, archived: [] });
  const reads = readsFor({ op: 'start' });
  for (const [i, read] of reads.entries()) {
    const s = fetchReads(root, reads.filter((_, j) => j !== i));
    assert.throws(
      () => planOperation({ snapshot: s.dir, versions: s.versions, out: planDir(), op: 'start', pointer }),
      (e) => e instanceof MissingReads && e.message.includes(JSON.stringify(read)),
    );
  }
});
