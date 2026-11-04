// The CLI's reads and plan across two Cycles (lean-turns 06), as the model runs them: the reads
// printed (the other Cycle's with its `url`, into the second snapshot), the read lines and
// versions copied into the versions file, then plan with the pointer file, which it only reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDocs } from '../lib/docs.mjs';
import { newCycle, readPointer } from './fixtures/cycle-seam.mjs';

const BIN = fileURLToPath(new URL('../bin/student-tracker-store', import.meta.url));
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function run(args, { input } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Sends each read as ArtifactData would, to its `url` (no url: the current Cycle), saving into
// its out_dir; the versions file gets the read line and "<doc path> <version>" per document.
function send(reads, current, versions) {
  for (const read of reads) {
    fs.appendFileSync(versions, `${JSON.stringify(read)}\n`);
    const docs = openDocs((read.url ?? current).replace(/^local:/, ''));
    const found = read.action === 'get'
      ? [docs.get(`${read.collection}/${read.doc_id}`)].filter(Boolean).map((d) => ({ id: read.doc_id, ...d }))
      : docs.list(read.collection);
    for (const doc of found) {
      const file = path.join(read.out_dir, read.collection, `${doc.id}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(doc.data));
      fs.appendFileSync(versions, `${read.collection}/${doc.id} ${doc.version}\n`);
    }
  }
}

test('copy-commander-scope through the CLI: reads of both Cycles, then a plan writing the new one', () => {
  const { dataDir, previous } = newCycle();
  const pointer = path.join(dataDir, 'cycles.json');
  const before = fs.readFileSync(pointer, 'utf8');
  const snapshot = path.join(tmp('st-cli-snap-'), 'snapshot');
  const printed = run(['reads', 'copy-commander-scope', previous, '--snapshot', snapshot]);
  assert.equal(printed.code, 0, printed.err);
  const { reads } = JSON.parse(printed.out);
  assert.ok(reads.some((r) => r.url === previous), 'the previous Cycle is read at its address');

  const versions = path.join(tmp('st-cli-versions-'), 'versions.txt');
  send(reads, readPointer(dataDir).current, versions);
  const out = path.join(tmp('st-cli-plan-'), 'plan');
  const planned = run(['plan', 'copy-commander-scope', previous, '--snapshot', snapshot, '--versions', versions, '--out', out, '--pointer', pointer]);
  assert.equal(planned.code, 0, planned.err);
  const { result, batches, pointer: write } = JSON.parse(planned.out);
  assert.equal(result.playbook.length, 2);
  assert.equal(write, undefined, 'the pointer is as setup wrote it');
  assert.ok(batches[0].some((w) => w.collection === 'playbook'));
  assert.equal(fs.readFileSync(pointer, 'utf8'), before, 'the plan never writes the pointer');
});

test('plan create-cycle without the pointer file is refused', () => {
  const snapshot = tmp('st-cli-snap-');
  const r = run(['plan', 'create-cycle', '--snapshot', snapshot, '--out', path.join(tmp('st-cli-plan-'), 'plan')], { input: 'commander: רז\ncycle: הכתומים\n' });
  assert.equal(r.code, 1);
  assert.match(r.err, /--pointer/);
});
