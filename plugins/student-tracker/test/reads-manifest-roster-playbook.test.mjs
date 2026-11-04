// The reads manifest (lean-turns spec, Testing Decisions) for the roster, settings, Cycle-change
// and Playbook operations: a snapshot holding exactly the manifest's reads plans; without any one
// of them, planning refuses and names it.
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoreError } from '../lib/store.mjs';
import { planOperation, readsFor } from '../lib/plan.mjs';
import { NOW, seededRand, fixture, storeRoot, fetchReads, planDir } from './fixtures/plan-seam.mjs';

const plan = (snapshot, op, { args, input }) => planOperation({
  snapshot: snapshot.dir, versions: snapshot.versions, out: planDir(), op, args, input, now: () => NOW, rand: seededRand(3),
});

function refusal(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    return e.message;
  }
}

// Plans with every read, then with each read dropped in turn.
function assertManifest(root, op, { args = [], input = '' } = {}) {
  const reads = readsFor({ op, args, input });
  assert.equal(refusal(() => plan(fetchReads(root, reads), op, { args, input })), null, `${op} ${args.join(' ')} with every read`);
  for (const [i, read] of reads.entries()) {
    const message = refusal(() => plan(fetchReads(root, reads.filter((_, j) => j !== i)), op, { args, input }));
    assert.ok(message?.includes(JSON.stringify(read)), `${op} ${args.join(' ')} without ${JSON.stringify(read)}: ${message}`);
  }
}

function withHistory() {
  const f = fixture(['נועה', 'דני']);
  const [noa, dani] = [f.id['נועה'], f.id['דני']];
  const entry = f.store.recordEntry({
    text: 'נועה פתרה את הבאג לבד.',
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-28', excerpt: 'נועה פתרה את הבאג לבד.' }],
  });
  f.store.updateTrainee(dani, { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' } });
  return { root: storeRoot(f.dataDir), noa, dani, entry, store: f.store };
}

test('update-settings and update-trainee: exactly the manifest\'s reads plan', () => {
  const { root, noa, dani, entry } = withHistory();
  assertManifest(root, 'update-settings', { input: 'target: 7\n' });
  assertManifest(root, 'update-trainee', { input: 'add: יואב\n' });
  assertManifest(root, 'update-trainee', { args: [noa], input: 'rename: נועה כ.\n' });
  assertManifest(root, 'update-trainee', { args: [noa], input: `status: watch\nreason: צריכה ליווי\nevidence: ${entry.evidence[0]}\n` });
  assertManifest(root, 'update-trainee', { args: [noa], input: 'leave: 2026-10-30\nhow: other\nreason: סיימה\n' });
  assertManifest(root, 'update-trainee', { args: [dani], input: 'rejoin\n' });
});

const BASE_ID = JSON.parse(fs.readFileSync(new URL('../data/playbook.json', import.meta.url), 'utf8')).items[0].id;
const SKILL = 'learn.self-awareness';

test('Playbook items: exactly the manifest\'s reads plan', () => {
  const { root, entry, store } = withHistory();
  const own = store.savePlaybookItem({ kind: 'tip', skills: [SKILL], text: 'לשאול מה ניסתה' });
  assertManifest(root, 'save-playbook-item', { input: `+kind: tip\n+skills: ${SKILL}\nטיפ חדש\n` });
  assertManifest(root, 'save-playbook-item', { input: `+kind: tip\n+skills: general\n+source: ${entry.entry}\nנועה פתרה את הבאג לבד.\n` });
  assertManifest(root, 'save-playbook-item', { args: [own.id], input: '+band: mid\n' });
  assertManifest(root, 'retire-playbook-item', { args: [own.id] });
  assertManifest(root, 'hide-playbook-item', { args: [BASE_ID] });
  store.hidePlaybookItem(BASE_ID, true);
  assertManifest(root, 'unhide-playbook-item', { args: [BASE_ID] });
});

test('update-cycle and finish-setup: exactly the manifest\'s reads plan', () => {
  const { root, noa, store } = withHistory();
  const { preset, skills } = store.readCycle();
  const [subject, project] = [preset.subjects[0].id, preset.projects[0].id];
  assertManifest(root, 'update-cycle', { input: `add-test: מבחן חדש\nsubject: ${subject}\n` });
  assertManifest(root, 'update-cycle', { input: `remove-project: ${project}\n` });
  assertManifest(root, 'update-cycle', { input: `add-skill: הקשבה\ngroup: ${skills.groups[0].id}\n` });
  assertManifest(root, 'update-cycle', { input: `team: הנמרים\nproject: ${project}\nmember: ${noa}\n` });
  assertManifest(root, 'finish-setup');
});
