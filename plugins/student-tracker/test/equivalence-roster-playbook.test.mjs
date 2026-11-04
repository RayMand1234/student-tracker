// One engine for both backends (lean-turns spec), for the roster, settings, Cycle-change and
// Playbook operations: each run directly on the local backend and through snapshot → plan →
// apply leaves identical stores and gives identical results and refusals. The planned run's
// snapshot holds exactly the reads the operation's manifest names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/plan-seam.mjs';
import { assertSame } from './fixtures/cycle-seam.mjs';

test('update-settings: a changed name, role and Talk target, and a refused threshold', () => {
  const { dataDir } = fixture();
  assertSame(dataDir, 'update-settings', { input: 'name: רז כ.\nrole: מ"מ\ntarget: 7\n' });
  assertSame(dataDir, 'update-settings', { input: 'yellow: 20\n', refuses: true });
});

const MARK = '[פרט אישי — בתיק]';

// A fixture Cycle with history: a Talk with a sensitive part about נועה, and דני who left.
function withHistory() {
  const f = fixture(['נועה', 'דני', 'מאיה']);
  const [noa, dani] = [f.id['נועה'], f.id['דני']];
  const entry = f.store.recordEntry({
    text: 'נועה פתרה את הבאג לבד. אבא שלה בבית חולים.',
    evidence: [{
      trainee: noa, kind: 'note', date: '2026-10-28', excerpt: `נועה פתרה את הבאג לבד. ${MARK}`,
      sensitive: [{ category: 'family', excerpt: 'אבא שלה בבית חולים.' }],
    }],
  });
  f.store.updateTrainee(dani, { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' } });
  return { ...f, noa, dani, maya: f.id['מאיה'], entry };
}

test('update-trainee: add, rename, Status, leaving and rejoining, the same both ways', () => {
  const { dataDir, noa, dani, maya, entry } = withHistory();
  assertSame(dataDir, 'update-trainee', { input: 'add: יואב\n' });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'rename: נועה כ.\n' });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: `status: watch\nreason: צריכה ליווי בדיבאג\nevidence: ${entry.evidence[0]}\n` });
  assertSame(dataDir, 'update-trainee', { args: [maya], input: 'leave: 2026-10-30\nhow: other\nreason: סיימה מוקדם\n' });
  assertSame(dataDir, 'update-trainee', { args: [dani], input: 'rejoin\n' });
});

test('update-trainee: refusals are the same both ways', () => {
  const { dataDir, noa, dani, maya } = withHistory();
  assertSame(dataDir, 'update-trainee', { input: 'add: נועה\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [maya], input: 'rename: נועה\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: ['t-nobody'], input: 'rename: מישהו\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'status: watch\nreason: אבא שלה בבית חולים.\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [dani], input: 'leave: 2026-10-30\nhow: other\nreason: שוב\n', refuses: true });
  assertSame(dataDir, 'update-trainee', { args: [noa], input: 'rejoin\n', refuses: true });
});
