// One engine for both backends (lean-turns spec), for the operations that span two Cycles:
// createCycle, copyCommanderScope and archiveCycle, and a write refused on an archived Cycle.
// The planned run is the model's on the artifact backend: setup has published the new page and
// written the pointer, the plan step reads the current snapshot and the other Cycle's, and the
// pointer the plan gives is written (by the model, with the Write tool) before the batches go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { NOW, seededRand } from './fixtures/plan-seam.mjs';
import { assertSameAcross, previousCycle, newCycle, createInput, publishPage, NEW_CYCLE } from './fixtures/cycle-seam.mjs';

test('create-cycle: the first Cycle, seeded into the page setup published', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-first-'));
  const r = assertSameAcross(dataDir, 'create-cycle', { input: createInput({ trainees: ['נועה', 'דני'], extra: 'role: מ"מ\ntarget: 7' }), prepare: publishPage(), skip: 6 });
  assert.equal(r.local.result.trainees.length, 2);
});

test('create-cycle: a new Cycle after the previous one, starting from its settings', () => {
  const { dataDir, previous } = previousCycle();
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ previous }), prepare: publishPage(true), skip: 6 });
});

test('create-cycle: an interrupted setup of a new Cycle is finished, keeping what it stored', () => {
  const { dataDir, previous } = newCycle();
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ previous, trainees: ['מאיה', 'יואב'] }) });
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ trainees: ['מאיה'] }) });
});

test('create-cycle: refusals are the same both ways', () => {
  const { dataDir, previous } = previousCycle();
  assertSameAcross(dataDir, 'create-cycle', { input: createInput(), refuses: true });
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ previous: 'local:/elsewhere' }), prepare: publishPage('local:/elsewhere'), refuses: true });
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ previous, trainees: ['נועה', 'נועה'] }), prepare: publishPage(true), refuses: true });
  assertSameAcross(dataDir, 'create-cycle', { input: createInput({ previous, extra: 'yellow: 30' }), prepare: publishPage(true), refuses: true });
});

test('copy-commander-scope: settings, Skills, items and hides carried over, then nothing the second time', () => {
  const { dataDir, previous, store } = newCycle();
  const first = assertSameAcross(dataDir, 'copy-commander-scope', { args: [previous] }).local.result;
  assert.equal(first.skills.length, 1, 'the Commander\'s Skill came along');
  assert.equal(first.playbook.length, 2, 'both items came along');
  store.copyCommanderScope(previous);
  const again = assertSameAcross(dataDir, 'copy-commander-scope', { args: [previous] }).local.result;
  assert.deepEqual([again.skills, again.playbook, again.hidden], [[], [], []]);
});

test('archive-cycle: the previous Cycle marked archived, then left as it is the second time', () => {
  const { dataDir, previous, store } = newCycle();
  const r = assertSameAcross(dataDir, 'archive-cycle', { args: [previous] });
  assert.equal(r.local.result.archived, true);
  store.archiveCycle(previous);
  assertSameAcross(dataDir, 'archive-cycle', { args: [previous] });
});

test('archive-cycle: a pointer that lost the previous Cycle gets it back, the plan giving the pointer to write', () => {
  const { dataDir, previous, current } = newCycle();
  fs.writeFileSync(path.join(dataDir, 'cycles.json'), JSON.stringify({ current, archived: [] }));
  const r = assertSameAcross(dataDir, 'archive-cycle', { args: [previous] });
  assert.equal(r.plannedPointer.archived.length, 1);
});

test('archive-cycle: an Entry an earlier session left half-written there is finished first', () => {
  const { dataDir, id, previous } = previousCycle();
  const crashing = openStore({ dataDir, now: () => NOW, rand: seededRand(9), interrupt: (point) => { if (point === 'chunk') throw new Error('crash'); } });
  assert.throws(() => crashing.recordEntry({
    text: 'דיברתי עם נועה ועם דני.',
    evidence: [
      { trainee: id['נועה'], kind: 'talk', date: '2026-10-29', excerpt: 'דיברתי עם נועה' },
      { trainee: id['דני'], kind: 'talk', date: '2026-10-29', excerpt: 'ועם דני.' },
    ],
  }), /crash/);
  openStore({ dataDir, now: () => NOW, rand: seededRand(5) }).createCycle({ ...NEW_CYCLE, previous });
  const r = assertSameAcross(dataDir, 'archive-cycle', { args: [previous] });
  assert.equal(r.local.result.archived, true);
});

test('archive-cycle: refused for the current Cycle and for no Cycle', () => {
  const { dataDir, current } = newCycle();
  assertSameAcross(dataDir, 'archive-cycle', { args: [current], refuses: true });
  assertSameAcross(dataDir, 'archive-cycle', { args: ['local:/nowhere'], refuses: true });
});

test('a write on an archived Cycle is refused naming the current Cycle, the same both ways', () => {
  const { dataDir, previous, store } = newCycle();
  store.archiveCycle(previous);
  const r = assertSameAcross(dataDir, 'update-settings', { cycle: previous, input: 'target: 5\n', refuses: true });
  assert.match(r.planned.refusal, /עדכונים נרשמים במחזור הנוכחי, הכתומים\./);
});

test('copy-commander-scope: refused from the current Cycle, from no Cycle and after setup is done', () => {
  const { dataDir, previous, current, store } = newCycle();
  assertSameAcross(dataDir, 'copy-commander-scope', { args: [current], refuses: true });
  assertSameAcross(dataDir, 'copy-commander-scope', { args: ['local:/nowhere'], refuses: true });
  store.finishSetup();
  assertSameAcross(dataDir, 'copy-commander-scope', { args: [previous], refuses: true });
});
