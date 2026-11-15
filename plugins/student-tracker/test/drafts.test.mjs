// Drafts from the dashboard's + button: the page writes `inbox/<id>`, `start` lists the waiting
// ones, and `close-draft` closes each once it is recorded as an Entry (or dropped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../lib/store.mjs';
import { openDocs } from '../lib/docs.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';

// What the page writes for one draft.
const draft = (text, at, status = 'new') => ({ text, at, date: at.slice(0, 10), status, source: 'dashboard' });

function withDrafts() {
  const f = fixture(['נועה', 'דני']);
  openDocs(f.root).batch([
    { op: 'create', path: 'inbox/q-2', data: draft('נוהל מחלקתי - דני שאל הרבה שאלות', '2026-10-29T18:00:00.000Z') },
    { op: 'create', path: 'inbox/q-1', data: draft('נועה עזרה לחברה בתרגיל', '2026-10-28T08:00:00.000Z') },
    { op: 'create', path: 'inbox/q-0', data: draft('כבר נרשם', '2026-10-27T08:00:00.000Z', 'done') },
  ]);
  return f;
}

const recordNoa = (store, id) => store.recordEntry({
  text: 'נועה עזרה לחברה בתרגיל',
  evidence: [{ trainee: id['נועה'], kind: 'note', date: '2026-10-28', excerpt: 'נועה עזרה לחברה בתרגיל' }],
}).entry;

test('start lists the waiting drafts, oldest first, and leaves closed ones out', () => {
  const { dataDir } = withDrafts();
  const { drafts } = runOperation(openStore({ dataDir, now: () => NOW }), 'start');
  assert.deepEqual(drafts.map((d) => d.id), ['q-1', 'q-2']);
  assert.deepEqual(drafts[0], { id: 'q-1', text: 'נועה עזרה לחברה בתרגיל', date: '2026-10-28', at: '2026-10-28T08:00:00.000Z' });
});

test('start with no drafts gives an empty list', () => {
  const { dataDir } = fixture();
  assert.deepEqual(runOperation(openStore({ dataDir, now: () => NOW }), 'start').drafts, []);
});

test('close-draft marks a draft recorded as its Entry; it then leaves start, and closing it again is refused', () => {
  const { dataDir, id } = withDrafts();
  const store = openStore({ dataDir, now: () => NOW, rand: seededRand(2) });
  const entry = recordNoa(store, id);
  const closed = runOperation(store, 'close-draft', { args: ['q-1', entry] });
  assert.equal(closed.status, 'done');
  assert.equal(closed.entry, entry);
  assert.equal(closed.text, 'נועה עזרה לחברה בתרגיל', 'the draft keeps its words');
  assert.deepEqual(runOperation(store, 'start').drafts.map((d) => d.id), ['q-2']);
  assert.throws(() => runOperation(store, 'close-draft', { args: ['q-1', entry] }), /already recorded/);
});

test('close-draft with no Entry drops the draft; an unknown draft or Entry is refused', () => {
  const { dataDir } = withDrafts();
  const store = openStore({ dataDir, now: () => NOW });
  assert.throws(() => runOperation(store, 'close-draft', { args: ['q-2', 'e-20261030-0915-zz'] }), /no Entry/);
  assert.throws(() => runOperation(store, 'close-draft', { args: ['q-9'] }), /no draft q-9/);
  assert.throws(() => runOperation(store, 'close-draft', { args: [] }), /needs <draft id>/);
  const dropped = runOperation(store, 'close-draft', { args: ['q-2'] });
  assert.equal(dropped.status, 'dropped');
  assert.equal(dropped.entry, null);
});

test('plan close-draft reads the Cycle, the draft and its Entry, and writes the draft as the local store does', () => {
  const { dataDir, root, id } = withDrafts();
  const entry = recordNoa(openStore({ dataDir, now: () => NOW, rand: seededRand(2) }), id);
  const args = ['q-1', entry];
  assert.deepEqual(readsFor({ op: 'close-draft', args }).map((r) => `${r.action} ${r.collection}/${r.doc_id}`),
    ['get meta/cycle', 'get inbox/q-1', `get entries/${entry}`]);
  const s = fetchReads(root, readsFor({ op: 'close-draft', args }));
  const planned = planOperation({ snapshot: s.dir, versions: s.versions, out: planDir(), op: 'close-draft', args, now: () => NOW });
  assert.equal(planned.batches.length, 1);
  assert.deepEqual(planned.batches[0].map((w) => [w.op, `${w.collection}/${w.doc_id}`, typeof w.if_version]), [['set', 'inbox/q-1', 'number']]);
  applyPlan(root, planned.batches);
  assert.deepEqual(openStore({ dataDir }).readDrafts().map((d) => d.id), ['q-2']);
  assert.equal(planned.result.entry, entry);
});

test('an archived Cycle shows no drafts, and closing one there is refused', () => {
  const { dataDir, root } = withDrafts();
  const docs = openDocs(root);
  const cycle = docs.get('meta/cycle');
  docs.batch([{ op: 'set', path: 'meta/cycle', data: { ...cycle.data, archived: true }, ifVersion: cycle.version }]);
  const store = openStore({ dataDir, now: () => NOW });
  assert.equal(runOperation(store, 'start').drafts, undefined);
  assert.throws(() => runOperation(store, 'close-draft', { args: ['q-1'] }), /בארכיון/);
});
