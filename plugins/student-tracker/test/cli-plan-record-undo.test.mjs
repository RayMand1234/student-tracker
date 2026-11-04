// The plan step from the CLI for records outside an Entry, flips and withdrawals (lean-turns 05),
// spawned through `node` so it runs on Windows too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchReads, storeRoot, applyPlan } from './fixtures/plan-seam.mjs';

const BIN = fileURLToPath(new URL('../bin/student-tracker-store', import.meta.url));
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function run(args, { cwd, input } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// reads → fetch (and fetch again what "missing reads" names) → plan; the printed plan.
function plan(root, cwd, op, args = []) {
  let reads = JSON.parse(run(['reads', op, ...args], { cwd }).out).reads.map(({ out_dir: _, ...r }) => r);
  for (let round = 0; round < 4; round++) {
    const { dir, versions } = fetchReads(root, reads);
    const r = run(['plan', op, ...args, '--snapshot', dir, '--versions', versions, '--out', path.join(tmp('st-cli-plan-'), 'plan')], { cwd });
    if (r.code === 0) return JSON.parse(r.out);
    assert.match(r.err, /missing reads/, r.err);
    reads = [...reads, ...r.err.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))];
  }
  throw new Error(`${op} kept asking for reads`);
}

test('plan flip-sensitive takes --category, and plan retract-entry withdraws the Entry it names', () => {
  const data = tmp('st-cli-data-');
  const cwd = tmp('st-cli-cwd-');
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: 'commander: רז\ncycle: הצהובים\ntrainee: נועה\n' }).out).trainees;
  run(['--data', data, 'finish-setup'], { cwd });
  const { entry } = JSON.parse(run(['--data', data, 'record-entry'], {
    cwd, input: `--- entry\nנועה סיפרה על הבית.\n--- evidence ${noa.id} note 2026-10-30\nנועה סיפרה על הבית.\n`,
  }).out);
  const root = storeRoot(data);

  const flipped = plan(root, cwd, 'flip-sensitive', [`${entry}-1`, '--category', 'family']);
  assert.deepEqual(flipped.result, { id: `${entry}-1`, now: 'sensitive', moved: [`${entry}-1`] });
  applyPlan(root, flipped.batches);
  assert.equal(JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out).evidence.length, 0, 'moved out of the public records');

  const retracted = plan(root, cwd, 'retract-entry', [entry]);
  assert.deepEqual(retracted.result, { entry, trainees: [noa.id], retracted: [`${entry}-1`] });
  assert.equal(retracted.batches.length, 1, 'a small Retraction is one batch');
  assert.equal(retracted.if_refused, undefined);
  applyPlan(root, retracted.batches);
  assert.deepEqual(JSON.parse(run(['--data', data, 'resume-pending'], { cwd }).out), { finished: [] }, 'nothing left half-done');
});
