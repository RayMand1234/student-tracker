// Shared harness for evals on the storage-interface seam: drive the real skills through
// `claude -p` against the local test backend; tests assert on stored state through the storage
// reads only. Eval files share the data dir below, so they run one at a time (see package.json).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from '../lib/store.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A plugin loaded with --plugin-dir gets its own data dir, separate from an installed copy's.
// The evals own its pointer while they run: a pointer marked `backend: local` selects the test store.
export const DATA = path.join(os.homedir(), '.claude/plugins/data/student-tracker-inline');
export const POINTER = path.join(DATA, 'cycles.json');
const BACKUP = `${POINTER}.eval-backup`;

// Call once per eval file: sets the developer's real pointer aside for the run.
export function useEvalPointer() {
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
}

// Remove the store the test pointer names (only test pointers reach here).
export function dropTestStore() {
  if (!fs.existsSync(POINTER)) return;
  const { current } = JSON.parse(fs.readFileSync(POINTER, 'utf8'));
  if (current?.startsWith('local:')) fs.rmSync(current.slice('local:'.length), { recursive: true, force: true });
}

export function freshTestStore(options = {}) {
  dropTestStore();
  fs.writeFileSync(POINTER, JSON.stringify({ backend: 'local', current: null, archived: [] }));
  return openStore({ dataDir: DATA, ...options });
}

export function workspace() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'st-eval-'));
  console.log(`workspace: ${cwd}`);
  return cwd;
}

export const newSession = () => ({ id: randomUUID(), resume: false });

// One turn of a Commander session. `session` = {id, resume}: the first turn creates it, later turns resume it.
export function claude(cwd, prompt, session = newSession()) {
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

// YYYY-MM-DD, local, `days` from today.
export function day(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv-SE');
}
export const today = () => day(0);
