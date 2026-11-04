// Reads, status, Playbook selection and alerts through the plan step (lean-turns 04): each read
// returns the same result as on the local backend; take-alert and rebuild-card also leave the
// same store. A read that writes nothing plans to no batches: {result, plan: null, batches: []}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openStore, StoreError } from '../lib/store.mjs';
import { runOperation } from '../lib/operations.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, copyDataDir, storeRoot, contents, fetchReads, applyPlan, planDir } from './fixtures/plan-seam.mjs';

const MARK = '[פרט אישי — בתיק]';
const LATER = new Date('2026-11-20T09:00:00');

function outcome(fn) {
  try {
    return { result: fn() };
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return { refusal: e.message };
  }
}

// `op` run on the local backend and through snapshot → plan → apply, from the same state.
// `cycle`: an archived Cycle's address, read by both runs. `now`: both runs' clock.
function bothWays(dataDir, op, { args = [], input = '', cycle, now = NOW, ...opts } = {}) {
  const clock = { now: () => now };
  const localDir = copyDataDir(dataDir);
  const local = outcome(() => runOperation(openStore({ dataDir: localDir, cycle, ...clock, rand: seededRand(3) }), op, { args, input, ...opts }));

  const appliedDir = copyDataDir(dataDir);
  const root = cycle ? cycle.replace(/^local:/, '') : storeRoot(appliedDir);
  const before = contents(root);
  let plan;
  const planned = outcome(() => {
    const snapshot = fetchReads(root, readsFor({ op, args, input }));
    plan = planOperation({ snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, ...opts, ...clock, rand: seededRand(3) });
    applyPlan(root, plan.batches);
    return plan.result;
  });
  const after = cycle ? { archivedUnchanged: JSON.stringify(contents(root)) === JSON.stringify(before) } : {};
  return { local, planned, plan, ...after, localStore: contents(storeRoot(localDir)), plannedStore: contents(storeRoot(appliedDir)) };
}

function assertSame(dataDir, op, { refuses = false, ...opts } = {}) {
  const r = bothWays(dataDir, op, opts);
  assert.equal(Boolean(r.local.refusal), refuses, r.local.refusal ?? 'expected a refusal');
  assert.deepEqual(r.planned, r.local);
  assert.deepEqual(r.plannedStore, r.localStore);
  return r;
}

const assertReadOnly = (r) => assert.deepEqual({ plan: r.plan.plan, batches: r.plan.batches }, { plan: null, batches: [] });

// A Cycle with history: Noa's Talk with a sensitive part, a Follow-up and an Assessment; Dani's
// retracted Entry; a Playbook item of the Commander's and a hidden base item.
function history() {
  const f = fixture();
  const [noa, dani] = [f.id['נועה'], f.id['דני']];
  const talk = f.store.recordEntry({
    text: 'דיברתי עם נועה על הדיבאג. אבא שלה בבית חולים. לבדוק מה שלומה.',
    evidence: [{
      trainee: noa, kind: 'talk', date: '2026-10-28', excerpt: `דיברתי עם נועה על הדיבאג. ${MARK}`,
      followups: ['לבדוק מה שלומה.'],
      sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.' }],
    }],
  });
  f.store.recordAssessments(noa, [{ skill: 'impl.debugging', score: 2, author: 'agent', reason: 'מתקשה בדיבאג', evidence: [talk.evidence[0]] }]);
  f.store.recordEntry({ text: 'דני איחר.', evidence: [{ trainee: dani, kind: 'note', date: '2026-10-29', excerpt: 'דני איחר.' }] });
  f.store.retractEntry();
  f.store.savePlaybookItem({ kind: 'tip', skills: ['impl.debugging'], text: 'לפרק את הבאג לשלבים קטנים.' });
  f.store.hidePlaybookItem(f.store.readPlaybook(noa).general[0].id, true);
  return { ...f, noa, dani };
}

test('read-team: the same team both ways, and a plan with no batches', () => {
  const { dataDir } = fixture();
  const r = assertSame(dataDir, 'read-team');
  assert.deepEqual(r.local.result.map((t) => t.name).sort(), ['דני', 'נועה']);
  assertReadOnly(r);
});

test('read-cycle: the same Cycle, Skills, preset, Commander scope, Playbook and teams both ways', () => {
  const { dataDir } = history();
  const r = assertSame(dataDir, 'read-cycle');
  assert.equal(r.local.result.playbook.length, 1);
  assert.equal(r.local.result.commander.hides.hidden.length, 1);
  assertReadOnly(r);
});

test('read-trainee: the same records both ways, with --since and --retracted too', () => {
  const { dataDir, noa, dani } = history();
  for (const opts of [{}, { since: '2026-10-29' }, { retracted: true }]) {
    for (const tid of [noa, dani]) assertReadOnly(assertSame(dataDir, 'read-trainee', { args: [tid], ...opts }));
  }
  const r = assertSame(dataDir, 'read-trainee', { args: [noa] });
  assert.equal(r.local.result.sensitive.length, 1, 'the sensitive part is read');
  assert.equal(r.local.result.entries.length, 1);
  assert.equal(assertSame(dataDir, 'read-trainee', { args: [dani], retracted: true }).local.result.evidence.length, 1);
  assertSame(dataDir, 'read-trainee', { args: ['t-nobody'], refuses: true });
});

test('read-playbook: the same selection both ways, for the targets and for named Skills', () => {
  const { dataDir, noa } = history();
  for (const args of [[noa], [noa, 'impl.debugging'], [noa, 'impl.debugging', 'learn.independence']]) {
    assertReadOnly(assertSame(dataDir, 'read-playbook', { args }));
  }
  assertSame(dataDir, 'read-playbook', { args: ['t-nobody'], refuses: true });
  assertSame(dataDir, 'read-playbook', { args: [noa, 'no.such-skill'], refuses: true });
});

test('read-status: the same team status both ways, today and three weeks on', () => {
  const { dataDir } = history();
  for (const now of [NOW, LATER]) assertReadOnly(assertSame(dataDir, 'read-status', { now }));
});

test('take-alert: the same alert and the same meta/alerts both ways, turn after turn', () => {
  const { dataDir } = history();
  // Nothing due on the day the Cycle starts: no alert, nothing to write.
  const none = assertSame(dataDir, 'take-alert');
  assert.deepEqual(none.local.result, { alert: null, more: 0 });
  assertReadOnly(none);

  const first = assertSame(dataDir, 'take-alert', { now: LATER });
  assert.ok(first.local.result.alert, 'a Talk alert is due three weeks on');
  assert.equal(first.plan.batches.length, 1);
  // The next turn, after the first alert was shown: the next alert, not the same one again.
  openStore({ dataDir, now: () => LATER }).takeAlert();
  const next = assertSame(dataDir, 'take-alert', { now: LATER });
  assert.notEqual(next.local.result.alert.key, first.local.result.alert.key);
  assert.equal(next.plan.batches[0][0].if_version !== undefined, true, 'an existing meta/alerts is pinned');
});

test('take-alert with a pattern: the same alert both ways; an unknown Trainee or no theme is refused the same', () => {
  const { dataDir, noa } = history();
  const r = assertSame(dataDir, 'take-alert', { args: [noa, 'מאחר', 'לשיחות'] });
  assert.equal(r.local.result.alert.theme, 'מאחר לשיחות');
  assertSame(dataDir, 'take-alert', { args: ['t-nobody', 'מאחר'], refuses: true });
  assertSame(dataDir, 'take-alert', { args: [noa], refuses: true });
});

test('rebuild-card: the same card both ways; one already current plans to no batches', () => {
  const { dataDir, root, noa } = history();
  // A card out of step with its records is rebuilt from them.
  const file = path.join(root, 'trainees', `${noa}.json`);
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...card, data: { ...card.data, lastTalk: null } }));
  const r = assertSame(dataDir, 'rebuild-card', { args: [noa] });
  assert.equal(r.local.result.lastTalk, '2026-10-28');
  assert.equal(r.plan.batches.length, 1);

  const { dataDir: fresh, noa: other } = history();
  assertReadOnly(assertSame(fresh, 'rebuild-card', { args: [other] }));
  assertSame(fresh, 'rebuild-card', { args: ['t-nobody'], refuses: true });
});

// A Cycle archived after a new one started: its reads through the plan step, from its own address.
function archived() {
  const f = history();
  const { url } = f.store.connect();
  f.store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הכתומים' }, trainees: ['מאיה'], previous: url });
  f.store.copyCommanderScope(url);
  f.store.archiveCycle(url);
  f.store.finishSetup();
  return { ...f, url };
}

test('an archived Cycle reads the same through the plan step, from its own address', () => {
  const { dataDir, url, noa } = archived();
  for (const [op, args] of [['read-cycle', []], ['read-team', []], ['read-trainee', [noa]], ['read-playbook', [noa]], ['read-status', []]]) {
    const r = bothWays(dataDir, op, { args, cycle: url, now: LATER });
    assert.ok(r.local.result, `${op}: ${r.local.refusal}`);
    assert.deepEqual(r.planned, r.local, op);
    assertReadOnly(r);
  }
});

test('an archived Cycle refuses take-alert and rebuild-card through the plan step, and nothing is written', () => {
  const { dataDir, url, noa } = archived();
  for (const [op, args] of [['take-alert', []], ['rebuild-card', [noa]]]) {
    const r = bothWays(dataDir, op, { args, cycle: url, now: LATER });
    assert.match(r.local.refusal, /בארכיון — אפשר רק לקרוא ממנו/);
    assert.match(r.planned.refusal, /בארכיון — אפשר רק לקרוא ממנו/);
    assert.equal(r.archivedUnchanged, true);
  }
});
