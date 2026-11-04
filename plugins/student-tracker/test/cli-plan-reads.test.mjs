// The CLI's reads and plan for reads and alerts (lean-turns 04): a read prints its result with no
// batches and writes no plan folder; take-alert prints the alert and the meta/alerts write to send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchReads, storeRoot } from './fixtures/plan-seam.mjs';

const BIN = fileURLToPath(new URL('../bin/student-tracker-store', import.meta.url));
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function run(args, { cwd, input } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// A set-up Cycle with Noa's Talk on 2026-10-28 and a retracted note about her on 2026-10-29.
function setUp() {
  const data = tmp('st-cli-data-');
  const cwd = tmp('st-cli-cwd-');
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: 'commander: רז\ncycle: הצהובים\nstart: 2026-10-01\ntrainee: נועה\n' }).out).trainees;
  run(['--data', data, 'finish-setup'], { cwd });
  const entry = (date, text) => run(['--data', data, 'record-entry'], { cwd, input: `--- entry\n${text}\n--- evidence ${noa.id} note ${date}\n${text}\n` });
  entry('2026-10-28', 'נועה פתרה את הבאג.');
  entry('2026-10-29', 'נועה איחרה.');
  run(['--data', data, 'retract-entry'], { cwd });
  return { data, cwd, tid: noa.id };
}

// `reads <op>` then `plan <op>` over the snapshot those reads save, as the model runs them.
function planViaCli({ data, cwd }, op, args = []) {
  const snapshotDir = path.join(tmp('st-cli-snap-'), 'snapshot');
  const printed = run(['reads', op, '--snapshot', snapshotDir, ...args], { cwd });
  assert.equal(printed.code, 0, printed.err);
  const { dir, versions } = fetchReads(storeRoot(data), JSON.parse(printed.out).reads, snapshotDir);
  const out = path.join(tmp('st-cli-plan-'), 'plan');
  const planned = run(['plan', op, '--snapshot', dir, '--versions', versions, '--out', out, ...args], { cwd });
  assert.equal(planned.code, 0, planned.err);
  return { ...JSON.parse(planned.out), out };
}

test('plan read-trainee prints the read\'s result, no batches and no plan folder; --since and --retracted reach it', () => {
  const setup = setUp();
  const local = (...flags) => JSON.parse(run(['--data', setup.data, 'read-trainee', setup.tid, ...flags], { cwd: setup.cwd }).out);
  for (const flags of [[], ['--since', '2026-10-29'], ['--retracted']]) {
    const { result, plan, batches, out } = planViaCli(setup, 'read-trainee', [setup.tid, ...flags]);
    assert.deepEqual(result, local(...flags), flags.join(' '));
    assert.equal(plan, null);
    assert.deepEqual(batches, []);
    assert.ok(!fs.existsSync(out), 'a read writes no plan folder');
  }
  assert.equal(planViaCli(setup, 'read-trainee', [setup.tid]).result.evidence.length, 1);
  assert.equal(planViaCli(setup, 'read-trainee', [setup.tid, '--retracted']).result.evidence.length, 2);
  assert.equal(planViaCli(setup, 'read-trainee', [setup.tid, '--since', '2026-10-29', '--retracted']).result.evidence.length, 1);
});

test('plan take-alert prints the alert and one batch writing meta/alerts', () => {
  const setup = setUp();
  const { result, batches } = planViaCli(setup, 'take-alert');
  assert.ok(result.alert, 'a Talk alert is due a month into the Cycle with no Talk');
  assert.deepEqual(batches.map((b) => b.map((w) => `${w.op} ${w.collection}/${w.doc_id}`)), [['set meta/alerts']]);
  assert.ok(JSON.parse(fs.readFileSync(batches[0][0].file_path, 'utf8')).shown[result.alert.key]);
});
