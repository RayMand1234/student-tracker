// Code-review cases for the plan step (lean-turns): what a plan does when a create meets an
// existing id, where its missing reads save, archived-Cycle writes, truncated pages, recovery
// advice and argument checks. Run through the snapshot → plan → apply seam (plan-seam.mjs) and the CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlreadyExists, MissingReads } from '../lib/docs.mjs';
import { openStore } from '../lib/store.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, storeRoot, contents, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';
import { createInput, publishPage } from './fixtures/cycle-seam.mjs';

const clock = { now: () => NOW };

test('a planned create whose id another session took meanwhile is refused, not overwritten', () => {
  const { dataDir, id } = fixture();
  const input = `--- entry\nנועה עזרה בדיבאג.\n--- evidence ${id['נועה']} note 2026-10-30\nנועה עזרה בדיבאג.\n`;
  const root = storeRoot(dataDir);
  const snapshot = fetchReads(root, readsFor({ op: 'record-entry', input }));
  const plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'record-entry', input, ...clock, rand: seededRand(3) });
  const creates = plan.batches.flat().filter((w) => w.op === 'set' && w.if_version === undefined);
  assert.ok(creates.length, 'the plan creates records');

  // Another session writes a document at one of those ids between the reads and the send.
  const [taken] = creates;
  const other = { theirs: true };
  fs.mkdirSync(`${root}/${taken.collection}`, { recursive: true });
  fs.writeFileSync(`${root}/${taken.collection}/${taken.doc_id}.json`, JSON.stringify({ version: 1, data: other }));
  const before = contents(root);

  assert.throws(() => applyPlan(root, plan.batches), AlreadyExists);
  assert.deepEqual(contents(root), before, 'nothing written, their document kept');
});

test('the test apply refuses an unpinned set on an existing document, as the database does', () => {
  const { dataDir } = fixture();
  const root = storeRoot(dataDir);
  const before = contents(root);
  const file = `${planDir()}/cycle.json`;
  fs.writeFileSync(file, JSON.stringify({ name: 'overwritten' }));
  assert.throws(() => applyPlan(root, [[{ op: 'set', collection: 'meta', doc_id: 'cycle', file_path: file }]]), AlreadyExists);
  assert.deepEqual(contents(root), before);
});

test('a write planned over a Cycle read with --cycle is refused, even without the pointer file', () => {
  const { dataDir } = fixture();
  const input = 'role: מ"פ\n';
  const snapshot = fetchReads(storeRoot(dataDir), readsFor({ op: 'update-settings', input }));
  const plan = () => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'update-settings', input, cycle: 'https://claude.ai/artifact/old', ...clock });
  assert.throws(plan, /בארכיון/);
});

// A list whose result says more pages exist (`next_cursor`) is not a whole collection.
test('a list read with more pages is asked for again with its cursor, then plans', () => {
  const { dataDir } = fixture();
  const reads = readsFor({ op: 'read-team' });
  const snapshot = fetchReads(storeRoot(dataDir), reads);
  fs.appendFileSync(snapshot.versions, 'next_cursor: "c2"\n');
  const plan = () => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'read-team', ...clock });
  const [next] = missingReads(plan);
  assert.deepEqual(next, { ...reads[0], query: { ...reads[0].query, cursor: 'c2' }, out_dir: fs.realpathSync.native(snapshot.dir) });

  // The next page sent, its line added: the read is whole.
  const { out_dir: _, ...line } = next;
  fs.appendFileSync(snapshot.versions, `${JSON.stringify(line)}\n`);
  assert.equal(plan().result.length, 2);
});

// The line exactly as a live ArtifactData out_dir list prints it (probed 2026-11-04): prose follows the cursor.
test('a next_cursor line as the real tool prints it yields just the cursor', () => {
  const { dataDir } = fixture();
  const reads = readsFor({ op: 'read-team' });
  const snapshot = fetchReads(storeRoot(dataDir), reads);
  fs.appendFileSync(snapshot.versions, 'next_cursor: "ayEHo33Z-uRPig_gdb8G" — more documents exist; pass this as `query.cursor` to read the next page.\n');
  const [next] = missingReads(() => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'read-team', ...clock }));
  assert.equal(next.query.cursor, 'ayEHo33Z-uRPig_gdb8G');
});

test('a list page that came back full with no next_cursor in the versions list is refused, not taken as whole', () => {
  const { dataDir } = fixture();
  const reads = readsFor({ op: 'read-team' });
  const snapshot = fetchReads(storeRoot(dataDir), reads);
  const full = Array.from({ length: 1000 }, (_, i) => `trainees/t-${i} 1`);
  fs.writeFileSync(snapshot.versions, `${JSON.stringify(reads[0])}\n${full.join('\n')}\n`);
  assert.throws(
    () => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'read-team', ...clock }),
    /next_cursor/,
  );
});

// A setup seeding many Trainees takes several batches. Re-planning create-cycle resumes an
// interrupted seed, so that is its recovery: no resume-pending advice, which cannot repair it.
test('a create-cycle cut off after some of its batches is finished by planning it again, and says nothing of resume-pending', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-review-setup-'));
  publishPage()(dataDir);
  const pointer = path.join(dataDir, 'cycles.json');
  const root = storeRoot(dataDir);
  const names = Array.from({ length: 30 }, (_, i) => `חניך ${i + 1}`);
  const input = createInput({ trainees: names });
  const plan = (seed) => {
    const snapshot = fetchReads(root, readsFor({ op: 'create-cycle', input }));
    return planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'create-cycle', input, pointer, ...clock, rand: seededRand(seed) });
  };
  const first = plan(3);
  assert.ok(first.batches.length > 1, 'several batches');
  assert.equal(first.if_refused, undefined, 'a later batch refused: read, plan and send create-cycle again');

  applyPlan(root, first.batches.slice(0, Math.ceil(first.batches.length / 2)));
  applyPlan(root, plan(4).batches); // a later turn: other random ids
  const team = openStore({ dataDir }).readTeam().map((t) => t.name).sort();
  assert.deepEqual(team, [...names].sort(), 'every Trainee seeded once');
});

// A Cycle with one Entry about נועה, recorded on the local backend.
function withEntry() {
  const f = fixture();
  const input = `--- entry\nנועה עזרה בדיבאג.\n--- evidence ${f.id['נועה']} note 2026-10-30\nנועה עזרה בדיבאג.\n`;
  runOperation(openStore({ dataDir: f.dataDir, ...clock, rand: seededRand(5) }), 'record-entry', { input });
  return f;
}

const missingReads = (fn) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MissingReads) return e.reads;
    throw e;
  }
  return assert.fail('expected missing reads');
};

test('missing reads the run meets save into the snapshot folder (out_dir), like the manifest\'s', () => {
  const { dataDir } = withEntry();
  const snapshot = fetchReads(storeRoot(dataDir), readsFor({ op: 'retract-entry' }));
  const reads = missingReads(() => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'retract-entry', ...clock }));
  assert.ok(reads.length, 'the Trainee\'s card reads');
  for (const r of reads) assert.equal(r.out_dir, fs.realpathSync.native(snapshot.dir), JSON.stringify(r));
});

test('a manifest read left out of the versions list is asked for with its out_dir', () => {
  const { dataDir } = withEntry();
  const [first, ...rest] = readsFor({ op: 'retract-entry' });
  const snapshot = fetchReads(storeRoot(dataDir), rest);
  const reads = missingReads(() => planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op: 'retract-entry', ...clock }));
  assert.deepEqual(reads, [{ ...first, out_dir: fs.realpathSync.native(snapshot.dir) }]);
});

// The local backend pays for every read: finding an Entry's records and checking cited Evidence
// should not read a Trainee's records more often than building their card does.
function withOlderRecords() {
  const f = fixture();
  const noa = f.id['נועה'];
  const store = openStore({ dataDir: f.dataDir, ...clock, rand: seededRand(5) });
  const older = store.recordEntry({
    text: 'נועה פתרה את הבאג לבד. אבא שלה בבית חולים.',
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-28', excerpt: 'נועה פתרה את הבאג לבד. [פרט אישי — בתיק]', sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.' }] }],
  });
  return { ...f, noa, store, older: [older.evidence[0], older.sensitive[0]] };
}

// How many times each file whose name holds one of `ids` is read while `fn` runs.
function parses(t, ids, fn) {
  const reads = t.mock.method(fs, 'readFileSync');
  fn();
  const counts = ids.map((id) => reads.mock.calls.filter((c) => String(c.arguments[0]).includes(`${id}.json`)).length);
  reads.mock.restore();
  return counts;
}

test('a Retraction on the local backend reads the Trainee\'s other records once, for the card', (t) => {
  const { noa, store, older } = withOlderRecords();
  const later = store.recordEntry({ text: 'דיברתי עם נועה.', evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-30', excerpt: 'דיברתי עם נועה.' }] });
  assert.deepEqual(parses(t, older, () => store.retractEntry(later.entry)), [1, 1]);
});

test('Assessments citing several sensitive Evidence on the local backend read the sensitive records once for the cites', (t) => {
  const { noa, store, older } = withOlderRecords();
  const parts = store.recordEntry({
    text: 'נועה סיפרה על הבית. אמא שלה חולה. אחיה התגייס.',
    evidence: [{ trainee: noa, kind: 'talk', date: '2026-10-29', excerpt: '[פרט אישי — בתיק]', sensitive: [{ category: 'family', excerpt: 'אמא שלה חולה.' }, { category: 'family', excerpt: 'אחיה התגייס.' }] }],
  }).sensitive;
  const cites = [older[1], ...parts];
  const counts = parses(t, [older[0], older[1]], () => store.recordAssessments(noa, [{ skill: 'impl.debugging', score: 3, author: 'agent', reason: 'פתרה לבד', evidence: cites }]));
  // The cites (once), the display-safe check and the card: not once more per cite.
  assert.ok(counts[1] <= 3, `the sensitive record was read ${counts[1]} times`);
});

// An argument left out is refused before any read is named (no `trainees/undefined`).
test('an operation missing its argument is refused by name, before its reads', () => {
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'st-review-snap-'));
  const cases = [
    ['read-trainee', '', /read-trainee needs <tid>/],
    ['rebuild-card', '', /rebuild-card needs <tid>/],
    ['flip-sensitive', '', /flip-sensitive needs <evidence id>/],
    ['archive-cycle', '', /archive-cycle needs <previous Cycle address>/],
    ['update-trainee', 'rename: נועה ב', /update-trainee needs <tid>/],
  ];
  for (const [op, input, refusal] of cases) {
    assert.throws(() => readsFor({ op, input }), refusal, `reads ${op}`);
    const pointer = path.join(snapshot, 'cycles.json');
    assert.throws(() => planOperation({ snapshot, versions: undefined, out: planDir(), op, input, pointer }), refusal, `plan ${op}`);
  }
  assert.ok(readsFor({ op: 'update-trainee', input: 'add: מאיה' }).length, 'adding a Trainee takes no tid');
});
