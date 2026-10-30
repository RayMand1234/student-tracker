// The local document layer must refuse and version writes the way the artifact database does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDocs, VersionConflict, AlreadyExists } from '../lib/docs.mjs';

const fresh = () => openDocs(fs.mkdtempSync(path.join(os.tmpdir(), 'st-docs-')));

test('a create on an existing id is refused, not duplicated or overwritten', () => {
  const docs = fresh();
  docs.batch([{ op: 'create', path: 'entries/e-1', data: { text: 'א' } }]);
  assert.throws(() => docs.batch([{ op: 'create', path: 'entries/e-1', data: { text: 'ב' } }]), /already exists/);
  assert.equal(docs.get('entries/e-1').data.text, 'א');
});

test('a write to an existing document must pin the version it last read', () => {
  const docs = fresh();
  docs.batch([{ op: 'create', path: 'trainees/t-1', data: { lastTalk: null } }]);
  const { version } = docs.get('trainees/t-1');

  assert.throws(() => docs.batch([{ op: 'set', path: 'trainees/t-1', data: { lastTalk: 'x' } }]), /if_version/);
  docs.batch([{ op: 'update', path: 'trainees/t-1', data: { lastTalk: '2026-10-30' }, ifVersion: version }]);

  const stale = () => docs.batch([{ op: 'set', path: 'trainees/t-1', data: {}, ifVersion: version }]);
  assert.throws(stale, VersionConflict);
  assert.equal(docs.get('trainees/t-1').data.lastTalk, '2026-10-30');
  assert.notEqual(docs.get('trainees/t-1').version, version);
});

test('a batch with one refused write applies none of its writes', () => {
  const docs = fresh();
  docs.batch([{ op: 'create', path: 'trainees/t-1', data: { n: 1 } }]);
  const { version } = docs.get('trainees/t-1');
  docs.batch([{ op: 'update', path: 'trainees/t-1', data: { n: 2 }, ifVersion: version }]);

  assert.throws(
    () => docs.batch([
      { op: 'create', path: 'trainees/t-1/evidence/e-1-1', data: { kind: 'talk' } },
      { op: 'update', path: 'trainees/t-1', data: { n: 3 }, ifVersion: version },
    ]),
    VersionConflict,
  );
  assert.equal(docs.get('trainees/t-1/evidence/e-1-1'), null);
  assert.equal(docs.get('trainees/t-1').data.n, 2);
});

test('a batch is limited to 50 writes, 1 MiB, and each document once', () => {
  const docs = fresh();
  const creates = (n) => Array.from({ length: n }, (_, i) => ({ op: 'create', path: `c/d-${i}`, data: {} }));
  assert.throws(() => docs.batch(creates(51)), /1–50 writes/);
  assert.throws(() => docs.batch([...creates(1), ...creates(1)]), /twice/);
  const big = 'א'.repeat(200 * 1024);
  assert.throws(
    () => docs.batch(Array.from({ length: 3 }, (_, i) => ({ op: 'create', path: `c/big-${i}`, data: { big } }))),
    /1 MiB/,
  );
  assert.equal(docs.list('c').length, 0);
  docs.batch(creates(50));
  assert.equal(docs.list('c').length, 50);
});

test('a batch with no pinned write applies in order and keeps what it wrote before a refusal', () => {
  const docs = fresh();
  docs.batch([{ op: 'create', path: 'c/b', data: {} }]);
  assert.throws(
    () => docs.batch([
      { op: 'create', path: 'c/a', data: {} },
      { op: 'create', path: 'c/b', data: {} },
      { op: 'create', path: 'c/c', data: {} },
    ]),
    AlreadyExists,
  );
  assert.deepEqual(docs.list('c').map((d) => d.id), ['a', 'b']);
});
