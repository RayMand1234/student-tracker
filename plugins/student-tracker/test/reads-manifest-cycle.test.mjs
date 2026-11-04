// The reads manifest (lean-turns spec, Testing Decisions) for the operations across two Cycles:
// a snapshot holding exactly the manifest's reads of both Cycles plans; without any one of them,
// planning refuses and names it, with the address of the Cycle it is a read of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readsFor, OTHER } from '../lib/plan.mjs';
import { assertManifestAcross, previousCycle, newCycle, createInput, publishPage } from './fixtures/cycle-seam.mjs';

test('create-cycle: the first Cycle and a new Cycle after the previous one', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-first-'));
  assertManifestAcross(first, 'create-cycle', { input: createInput(), prepare: publishPage() });
  const { dataDir, previous } = previousCycle();
  assertManifestAcross(dataDir, 'create-cycle', { input: createInput({ previous }), prepare: publishPage(true) });
});

test('copy-commander-scope and archive-cycle', () => {
  const { dataDir, previous } = newCycle();
  assertManifestAcross(dataDir, 'copy-commander-scope', { args: [previous] });
  assertManifestAcross(dataDir, 'archive-cycle', { args: [previous] });
});

test('reads of the other Cycle carry its address and save into the second snapshot; archive-cycle\'s go to the archived Cycle', () => {
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'st-seam-snap-'));
  const long = fs.realpathSync.native(snapshot);
  const copy = readsFor({ op: 'copy-commander-scope', args: ['https://claude.ai/artifact/old'], snapshot });
  assert.ok(copy.some((r) => !r.url && r.out_dir === long), 'reads of the current Cycle');
  for (const r of copy.filter((x) => x.url)) {
    assert.equal(r.url, 'https://claude.ai/artifact/old');
    assert.equal(r.out_dir, path.join(long, OTHER));
  }
  const archive = readsFor({ op: 'archive-cycle', args: ['https://claude.ai/artifact/old'], snapshot });
  assert.ok(archive.every((r) => r.url === 'https://claude.ai/artifact/old' && r.out_dir === long), JSON.stringify(archive));
});
