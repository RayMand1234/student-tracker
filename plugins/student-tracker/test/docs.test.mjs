// The local document layer must refuse and version writes the way the artifact database does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDocs, openSnapshot, VersionConflict, AlreadyExists, getRead, listRead, queryRead, readKey } from '../lib/docs.mjs';
import { readVersions, readList } from '../lib/plan.mjs';

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

// The plan step's snapshot layer: an `out_dir` read folder (data only) plus the versions list.
function snapshot(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-snap-'));
  for (const [p, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, `${p}.json`)), { recursive: true });
    fs.writeFileSync(path.join(dir, `${p}.json`), JSON.stringify(data));
  }
  return dir;
}

test('a snapshot reads data-only files with their listed versions, and records writes without applying them', () => {
  const dir = snapshot({ 'trainees/t-1': { name: 'נועה' }, 'entries/e-1': { text: 'א' } });
  const docs = openSnapshot(dir, new Map([['trainees/t-1', 4], ['entries/e-1', 2]]));
  assert.deepEqual(docs.get('trainees/t-1'), { version: 4, data: { name: 'נועה' } });
  assert.equal(docs.get('trainees/t-2'), null);

  docs.batch([
    { op: 'create', path: 'trainees/t-1/evidence/e-2-1', data: { kind: 'talk' } },
    { op: 'set', path: 'trainees/t-1', data: { name: 'נועה', lastTalk: '2026-10-30' }, ifVersion: 4 },
  ]);
  assert.deepEqual(docs.get('trainees/t-1'), { version: 5, data: { name: 'נועה', lastTalk: '2026-10-30' } }, 'a later read sees the write');
  assert.deepEqual(docs.list('trainees/t-1/evidence').map((d) => d.id), ['e-2-1']);
  assert.throws(() => docs.batch([{ op: 'set', path: 'trainees/t-1', data: {}, ifVersion: 4 }]), VersionConflict);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'trainees/t-1.json'), 'utf8')), { name: 'נועה' }, 'nothing written to the snapshot');
  assert.ok(!fs.existsSync(path.join(dir, 'trainees/t-1/evidence')));

  assert.deepEqual(docs.writes(), [
    { path: 'trainees/t-1/evidence/e-2-1', before: null, after: { version: 1, data: { kind: 'talk' } } },
    { path: 'trainees/t-1', before: { version: 4 }, after: { version: 5, data: { name: 'נועה', lastTalk: '2026-10-30' } } },
  ]);
});

test('a snapshot refuses to pin a write to a document whose version was not listed', () => {
  const docs = openSnapshot(snapshot({ 'trainees/t-1': {} }));
  assert.throws(() => docs.batch([{ op: 'set', path: 'trainees/t-1', data: {}, ifVersion: undefined }]), /no version for trainees\/t-1/);
});

test('the versions list takes "<path> <version>" lines or the lines an out_dir read printed', () => {
  const dir = snapshot({ 'trainees/t-1': {}, 'trainees/t-1/evidence/e-1-1': {} });
  const list = path.join(dir, '..', `${path.basename(dir)}-versions.txt`);
  const printed = path.join(dir, 'trainees', 't-1', 'evidence', 'e-1-1.json');
  fs.writeFileSync(list, `trainees/t-1 3\n- "e-1-1"  96 bytes  version 2  "${printed}"\n`);
  assert.deepEqual([...readVersions(list, dir)], [['trainees/t-1', 3], ['trainees/t-1/evidence/e-1-1', 2]]);
  fs.writeFileSync(list, 'trainees/t-1 three\n');
  assert.throws(() => readVersions(list, dir), /unreadable versions line/);
});

test('a snapshot reads only through the reads made: a get that found nothing is absent, one never made is missing', () => {
  const dir = snapshot({ 'trainees/t-1': { name: 'נועה' }, 'trainees/t-1/evidence/e-1-1': { kind: 'talk' }, 'sensitive/e-1-2': { trainee: 't-1' } });
  const made = [getRead('trainees/t-1'), getRead('trainees/t-9'), listRead('trainees/t-1/evidence'), queryRead('sensitive', [['trainee', '==', 't-1']])];
  const docs = openSnapshot(dir, new Map([['trainees/t-1', 2]]), new Set(made.map(readKey)));

  assert.equal(docs.get('trainees/t-9'), null, 'read and absent');
  assert.equal(docs.get('trainees/t-1/evidence/e-1-9'), null, 'absent from a collection listed whole');
  assert.deepEqual(docs.list('trainees/t-1/evidence').map((d) => d.id), ['e-1-1']);
  assert.deepEqual(docs.query('sensitive', [['trainee', '==', 't-1']]).map((d) => d.id), ['e-1-2']);
  assert.deepEqual(docs.missing(), []);

  assert.equal(docs.get('meta/cycle'), null);
  assert.deepEqual(docs.list('trainees/t-1/items'), []);
  assert.deepEqual(docs.query('sensitive', [['trainee', '==', 't-2']]), [], 'another filter is another read');
  assert.equal(docs.get('sensitive/e-1-2'), null, 'a query covers its own filter, not a get in its collection');
  assert.deepEqual(docs.missing(), [
    getRead('meta/cycle'), listRead('trainees/t-1/items'), queryRead('sensitive', [['trainee', '==', 't-2']]), getRead('sensitive/e-1-2'),
  ]);
  assert.equal(docs.taken('entries/e-2'), false, 'an id probe needs no read');
  assert.equal(docs.missing().length, 4);
});

test('a snapshot file is parsed once, however often a plan gets or lists it: a snapshot does not change during a plan', (t) => {
  const dir = snapshot({ 'trainees/t-1': { name: 'נועה' }, 'trainees/t-2': { name: 'דני' } });
  const docs = openSnapshot(dir, new Map([['trainees/t-1', 2], ['trainees/t-2', 1]]));
  const reads = t.mock.method(fs, 'readFileSync');
  for (let i = 0; i < 5; i++) {
    assert.equal(docs.get('trainees/t-1').data.name, 'נועה');
    assert.equal(docs.list('trainees').length, 2);
  }
  assert.equal(reads.mock.callCount(), 2, 'one parse per file');
});

test('the versions list also records the reads made, one JSON line each, whatever their key order or out_dir', () => {
  const dir = snapshot({ 'trainees/t-1': {} });
  const list = path.join(dir, '..', `${path.basename(dir)}-reads.txt`);
  fs.writeFileSync(list, [
    JSON.stringify({ ...getRead('trainees/t-1'), out_dir: dir }),
    'trainees/t-1 3',
    JSON.stringify({ query: { limit: 1000, where: [['trainee', '==', 't-1']] }, collection: 'sensitive', action: 'query' }),
  ].join('\n'));
  const { versions, reads } = readList(list, dir);
  assert.deepEqual([...versions], [['trainees/t-1', 3]]);
  assert.deepEqual([...reads], [readKey(getRead('trainees/t-1')), readKey(queryRead('sensitive', [['trainee', '==', 't-1']]))]);
  fs.writeFileSync(list, '{"action":"get",\n');
  assert.throws(() => readList(list, dir), /unreadable read line/);
});
