// Eval on the storage-interface seam: drive the real skills through `claude -p` against the
// local test backend, then assert on stored state through the storage reads only.
// Runs real model calls on your credential: `npm run eval`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from '../lib/store.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TALK = 'דיברתי היום עם נועה, היא סיפרה שהיא נהנית מהפרויקט אבל נתקעת הרבה בדיבאג. סיכמנו שתשב עם דני על זה.';

// One turn of a Commander session. `session` = {id, resume}: the first turn creates it, later turns resume it.
function claude(cwd, testData, prompt, session = { id: randomUUID(), resume: false }) {
  const r = spawnSync(
    'claude',
    [
      '-p', prompt,
      ...(session.resume ? ['--resume', session.id] : ['--session-id', session.id]),
      '--plugin-dir', PLUGIN,
      // Only the plugin under test: skip the user's own plugins, hooks and settings.
      '--setting-sources', 'project,local',
      '--allowedTools', 'Bash(student-tracker-store *)', 'Skill', 'Read',
      '--output-format', 'json',
      ...(process.env.EVAL_MODEL ? ['--model', process.env.EVAL_MODEL] : []),
    ],
    // STUDENT_TRACKER_DATA points the store at a throwaway dir, never the Commander's real pointer.
    { cwd, encoding: 'utf8', timeout: 600_000, env: { ...process.env, STUDENT_TRACKER_DATA: testData } },
  );
  assert.equal(r.status, 0, `claude exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout).result;
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local

test('setup + one Talk message: Entry kept whole, one Talk Evidence for Noa, last Talk date set', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-'));
  const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-data-'));
  const store = openStore({ dataDir: testData });
  console.log(`workspace: ${cwd}\nstore: ${testData}`);

  const setup = { id: randomUUID(), resume: false };
  const summary = claude(cwd, testData, '/student-tracker:setup אני רז, מחזור הצהובים, החניכים: נועה, דני, מאיה', setup);
  console.log(`setup summary:\n${summary}`);
  assert.match(summary, /לאשר\?/);
  assert.throws(() => store.connect(), /עוד לא הוקם מעקב/, 'nothing is created before the Commander confirms');

  const handOff = claude(cwd, testData, 'כן', { ...setup, resume: true });
  console.log(`setup hand-off:\n${handOff}`);

  const { cycle, commander } = store.readCycle();
  assert.equal(cycle.setup, 'done');
  assert.match(cycle.name, /צהוב/);
  assert.match(commander.settings.name, /רז/);
  assert.deepEqual(commander.settings.talk, { target: 10, yellow: 10, red: 14 });
  const team = store.readTeam();
  assert.deepEqual(team.map((t) => t.name).sort(), ['דני', 'מאיה', 'נועה']);
  for (const t of team) assert.match(t.id, /^t-[a-z0-9]{6}$/);

  const talkReply = claude(cwd, testData, TALK);
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
