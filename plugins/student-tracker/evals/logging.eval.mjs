// Eval on the storage-interface seam: drive the real skills through `claude -p` against the
// local test backend, then assert on stored state through the storage reads only.
// Runs real model calls on your credential: `npm run eval`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from '../lib/store.mjs';
import { openDocs } from '../lib/docs.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A plugin loaded with --plugin-dir gets its own data dir, separate from an installed copy's.
// The evals own its pointer while they run: a pointer marked `backend: local` selects the test store.
const DATA = path.join(os.homedir(), '.claude/plugins/data/student-tracker-inline');
const POINTER = path.join(DATA, 'cycles.json');
const BACKUP = `${POINTER}.eval-backup`;

before(() => {
  // A backup left by an interrupted run holds the developer's real pointer: never overwrite it.
  if (fs.existsSync(BACKUP)) throw new Error(`${BACKUP} exists from an interrupted eval; restore it to cycles.json first`);
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(POINTER)) fs.renameSync(POINTER, BACKUP);
});
after(() => {
  dropTestStore();
  fs.rmSync(POINTER, { force: true });
  if (fs.existsSync(BACKUP)) fs.renameSync(BACKUP, POINTER);
});

// Remove the store the test pointer names (only test pointers reach here).
function dropTestStore() {
  if (!fs.existsSync(POINTER)) return;
  const { current } = JSON.parse(fs.readFileSync(POINTER, 'utf8'));
  if (current?.startsWith('local:')) fs.rmSync(current.slice('local:'.length), { recursive: true, force: true });
}

function freshTestStore() {
  dropTestStore();
  fs.writeFileSync(POINTER, JSON.stringify({ backend: 'local', current: null, archived: [] }));
  return openStore({ dataDir: DATA });
}
const TALK = 'דיברתי היום עם נועה, היא סיפרה שהיא נהנית מהפרויקט אבל נתקעת הרבה בדיבאג. סיכמנו שתשב עם דני על זה.';

// One turn of a Commander session. `session` = {id, resume}: the first turn creates it, later turns resume it.
function claude(cwd, prompt, session = { id: randomUUID(), resume: false }) {
  const r = spawnSync(
    'claude',
    [
      '-p', prompt,
      ...(session.resume ? ['--resume', session.id] : ['--session-id', session.id]),
      '--plugin-dir', PLUGIN,
      // Only the plugin under test: skip the user's own plugins, hooks and settings.
      '--setting-sources', 'project,local',
      '--allowedTools', 'Bash(student-tracker-store *)', 'Bash(date *)', 'Skill', 'Read',
      '--output-format', 'json',
      ...(process.env.EVAL_MODEL ? ['--model', process.env.EVAL_MODEL] : []),
    ],
    { cwd, encoding: 'utf8', timeout: 600_000 },
  );
  assert.equal(r.status, 0, `claude exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout).result;
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local

test('setup + one Talk message: Entry kept whole, one Talk Evidence for Noa, last Talk date set', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-'));
  const store = freshTestStore();
  console.log(`workspace: ${cwd}`);

  const setup = { id: randomUUID(), resume: false };
  const summary = claude(cwd, '/student-tracker:setup אני רז, מחזור הצהובים, החניכים: נועה, דני, מאיה', setup);
  console.log(`setup summary:\n${summary}`);
  assert.match(summary, /לאשר\?/);
  assert.throws(() => store.connect(), /עוד לא הוקם מעקב/, 'nothing is created before the Commander confirms');

  const handOff = claude(cwd, 'כן', { ...setup, resume: true });
  console.log(`setup hand-off:\n${handOff}`);

  const { cycle, commander } = store.readCycle();
  assert.equal(cycle.setup, 'done');
  assert.match(cycle.name, /צהוב/);
  assert.match(commander.settings.name, /רז/);
  assert.deepEqual(commander.settings.talk, { target: 10, yellow: 10, red: 14 });
  const team = store.readTeam();
  assert.deepEqual(team.map((t) => t.name).sort(), ['דני', 'מאיה', 'נועה']);
  for (const t of team) assert.match(t.id, /^t-[a-z0-9]{6}$/);

  const talkReply = claude(cwd, TALK);
  console.log(`talk reply:\n${talkReply}`);
  assert.match(talkReply.trim(), /לביטול: 'בטל'$/);

  const byName = Object.fromEntries(team.map((t) => [t.name, t.id]));
  const noa = store.readTrainee(byName['נועה']);
  assert.deepEqual(noa.entries.map((e) => e.text), [TALK], 'the Entry is the message word-for-word');
  const talks = noa.evidence.filter((e) => e.kind === 'talk');
  assert.equal(talks.length, 1);
  assert.ok(TALK.includes(talks[0].excerpt));
  assert.equal(talks[0].date, today());
  assert.equal(talks[0].retracted, false);
  assert.ok(talks[0].at);
  assert.equal(noa.card.lastTalk, today());

  for (const name of ['דני', 'מאיה']) {
    const other = store.readTrainee(byName[name]);
    assert.equal(other.evidence.filter((e) => e.kind === 'talk').length, 0, `${name} had no Talk`);
    assert.equal(other.card.lastTalk, null);
  }
});

test('an Entry left half-written is finished by the next message, and cards rebuild to the same state', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-'));
  const store = freshTestStore();
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני', 'מאיה'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));

  // A session that died after Noa's chunk, before Dani's.
  const stuckText = 'דיברתי היום עם נועה. אחר כך ישבתי עם דני.';
  let chunks = 0;
  const dying = openStore({ dataDir: DATA, interrupt: (p) => { if (p === 'chunk-written' && ++chunks === 1) throw new Error('session died'); } });
  assert.throws(() => dying.recordEntry({
    text: stuckText,
    evidence: [
      { trainee: id['נועה'], kind: 'talk', date: today(), excerpt: 'דיברתי היום עם נועה.' },
      { trainee: id['דני'], kind: 'talk', date: today(), excerpt: 'אחר כך ישבתי עם דני.' },
    ],
  }), /session died/);
  assert.equal(store.readTrainee(id['דני']).evidence.length, 0);

  const reply = claude(cwd, 'דיברתי היום עם מאיה על הפרויקט');
  console.log(`reply:\n${reply}`);
  assert.doesNotMatch(reply, /דני|נועה/, 'finishing the old Entry is silent');

  for (const name of ['נועה', 'דני', 'מאיה']) {
    const t = store.readTrainee(id[name]);
    assert.equal(t.evidence.filter((e) => e.kind === 'talk').length, 1, `${name}: exactly one Talk`);
    assert.equal(t.card.lastTalk, today(), `${name}: last Talk date`);
    assert.ok(t.entries.every((e) => e.status === 'done'), `${name}: no Entry left writing`);
  }

  // Corrupt a card the agent wrote, rebuild it from the records, compare.
  const before = store.readTrainee(id['מאיה']).card;
  const docs = openDocs(store.connect().url.slice('local:'.length));
  const card = docs.get(`trainees/${id['מאיה']}`);
  docs.batch([{ op: 'set', path: `trainees/${id['מאיה']}`, data: { ...card.data, lastTalk: null, name: 'x' }, ifVersion: card.version }]);
  assert.deepEqual(store.rebuildCard(id['מאיה']), before);
});

test('setup without artifact tools stops before any question, with one Hebrew message of causes and fixes', () => {
  // `claude -p` has no artifact tools, and with no test pointer setup takes the artifact path.
  dropTestStore();
  fs.rmSync(POINTER, { force: true });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-'));

  const reply = claude(cwd, '/student-tracker:setup אני רז, מחזור הצהובים, החניכים: נועה');
  console.log(`preflight reply:\n${reply}`);

  assert.ok(reply.split('\n').filter((line) => line.trim().startsWith('•')).length >= 5, 'one message listing the causes');
  assert.doesNotMatch(reply, /לאשר\?/, 'no questions or summary after a failed preflight');
  assert.equal(fs.existsSync(POINTER), false, 'nothing was created');
});
