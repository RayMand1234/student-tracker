import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/student-tracker-store', import.meta.url));

function run(args, { cwd, input } = {}) {
  const r = spawnSync(BIN, args, { cwd, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function fresh() {
  return {
    data: fs.mkdtempSync(path.join(os.tmpdir(), 'st-cli-data-')),
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'st-cli-cwd-')),
  };
}

// Payloads are plain text, not JSON: Claude Code's Bash safety check refuses `{"` in a command.
const SETUP = `commander: רז
cycle: הצהובים
trainee: נועה כ.
trainee: דני
`;

test('the CLI prints JSON and reports refusals on stderr with exit 1', () => {
  const { data, cwd } = fresh();
  const missing = run(['--data', data, 'connect'], { cwd });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /עוד לא הוקם מעקב/);

  const created = run(['--data', data, 'create-cycle'], { cwd, input: SETUP });
  assert.equal(created.code, 0, created.err);
  assert.deepEqual(JSON.parse(created.out).trainees.map((t) => t.name), ['נועה כ.', 'דני']);
  assert.equal(JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out).commander.settings.name, 'רז');
});

test('record-entry takes the message and its Evidence as text blocks, keeping both word-for-word', () => {
  const { data, cwd } = fresh();
  const [noa, dani] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const text = 'דיברתי היום עם נועה על הרמ"ת שלה.\nגם דני הצטרף בסוף, {"נראה טוב"}: --- רגיל';
  const input = `--- entry
${text}
--- evidence ${noa.id} talk 2026-10-30
+topics: רמ"ת, דיבאג
דיברתי היום עם נועה על הרמ"ת שלה.
--- evidence ${dani.id} note 2026-10-30
גם דני הצטרף בסוף
`;
  const logged = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(logged.code, 0, logged.err);

  const t = JSON.parse(run(['--data', data, 'read-trainee', noa.id, '--since', '2026-10-01'], { cwd }).out);
  assert.equal(t.entries[0].text, text);
  assert.equal(t.evidence[0].excerpt, 'דיברתי היום עם נועה על הרמ"ת שלה.');
  assert.deepEqual(t.evidence[0].topics, ['רמ"ת', 'דיבאג']);
  assert.equal(t.card.lastTalk, '2026-10-30');
  const d = JSON.parse(run(['--data', data, 'read-trainee', dani.id], { cwd }).out);
  assert.deepEqual(d.evidence.map((e) => [e.kind, e.excerpt]), [['note', 'גם דני הצטרף בסוף']]);
});

test('a malformed record-entry payload is refused', () => {
  const { data, cwd } = fresh();
  run(['--data', data, 'create-cycle'], { cwd, input: SETUP });
  const r = run(['--data', data, 'record-entry'], { cwd, input: 'דיברתי עם נועה' });
  assert.equal(r.code, 1);
  assert.match(r.err, /--- entry/);
});

test('create-cycle keeps the pointer\'s backend mark, so a test pointer stays a test pointer', () => {
  const { data, cwd } = fresh();
  fs.writeFileSync(path.join(data, 'cycles.json'), '{"backend": "local", "current": null, "archived": []}');
  assert.equal(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).code, 0);
  const pointer = JSON.parse(fs.readFileSync(path.join(data, 'cycles.json'), 'utf8'));
  assert.equal(pointer.backend, 'local');
  assert.match(pointer.current, /^local:/);
});

test('resume-pending and rebuild-card are callable from the CLI', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;

  assert.deepEqual(JSON.parse(run(['--data', data, 'resume-pending'], { cwd }).out), { finished: [] });
  const card = JSON.parse(run(['--data', data, 'rebuild-card', noa.id], { cwd }).out);
  assert.equal(card.name, 'נועה כ.');
  assert.equal(run(['--data', data, 'rebuild-card', 't-nope00'], { cwd }).code, 1);
});

test('record-entry takes kind fields as "+key: value" lines and Follow-ups as their own blocks', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const text = 'נועה קיבלה 85 בפוב, לדעתה לא עברה. לשיחה הבאה: לשאול על הדיבאג';
  const input = `--- entry
${text}
--- evidence ${noa.id} test 2026-10-29
+subject: tabi
+test: FOV
+score: 85
+self: לא עברה
נועה קיבלה 85 בפוב, לדעתה לא עברה.
--- followup
לשאול על הדיבאג
`;
  const logged = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(logged.code, 0, logged.err);
  const { entry, followups } = JSON.parse(logged.out);
  const t = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  const ev = t.evidence[0];
  assert.deepEqual([ev.test, ev.score, ev.self, ev.unlisted], ['FOV', 85, 'לא עברה', false]);
  assert.deepEqual(followups, [`${entry}-2`]);
  assert.deepEqual(t.card.followups.map((f) => f.text), ['לשאול על הדיבאג']);

  const close = `--- entry
דיברתי עם נועה על הדיבאג
--- evidence ${noa.id} talk 2026-10-30
+closes: ${entry}-2
דיברתי עם נועה על הדיבאג
`;
  assert.equal(run(['--data', data, 'record-entry'], { cwd, input: close }).code, 0);
  assert.deepEqual(JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out).card.followups, []);
});

test('update-cycle adds a confirmed Test to the preset copy', () => {
  const { data, cwd } = fresh();
  run(['--data', data, 'create-cycle'], { cwd, input: SETUP });
  const r = run(['--data', data, 'update-cycle'], { cwd, input: 'add-test: Crocodile\nsubject: oop\nnumber: 4\nalias: קרוקודיל\nalias: קרוק\n' });
  assert.equal(r.code, 0, r.err);
  const croc = JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out).preset.tests.find((t) => t.name === 'Crocodile');
  assert.deepEqual([croc.subject, croc.number, croc.aliases], ['oop', '4', ['קרוקודיל', 'קרוק']]);
});

test('a blank or non-numeric score line is refused, never stored as a score', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  for (const score of ['', 'עבר']) {
    const input = `--- entry\nנועה עברה את פוב\n--- evidence ${noa.id} test 2026-10-30\n+test: FOV\n+score: ${score}\nנועה עברה את פוב\n`;
    const r = run(['--data', data, 'record-entry'], { cwd, input });
    assert.equal(r.code, 1);
    assert.match(r.err, /score must be a number/);
  }
  assert.deepEqual(JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out).evidence, []);
});
