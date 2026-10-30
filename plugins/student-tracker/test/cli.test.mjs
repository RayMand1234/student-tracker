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

test('record-entry takes a sensitive part as its own block after its Evidence, and flip-sensitive moves it', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const text = 'דיברתי עם נועה על הפרויקט. ההורים שלה מתגרשים. לבדוק איך היא מסתדרת. לשיחה הבאה: הדיבאג';
  const input = `--- entry
${text}
--- evidence ${noa.id} talk 2026-10-30
+topics: פרויקט
דיברתי עם נועה על הפרויקט. [פרט אישי — בתיק] לשיחה הבאה: הדיבאג
--- followup
לשיחה הבאה: הדיבאג
--- sensitive family
+kind: background
ההורים שלה מתגרשים. לבדוק איך היא מסתדרת.
--- followup
לבדוק איך היא מסתדרת.
`;
  const logged = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(logged.code, 0, logged.err);
  const { entry, evidence, sensitive, followups } = JSON.parse(logged.out);
  assert.deepEqual([evidence, sensitive, followups], [[`${entry}-1`], [`${entry}-2`], [`${entry}-3`, `${entry}-4`]]);

  const t = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  assert.deepEqual(t.sensitive.map((s) => [s.id, s.record, s.kind, s.category ?? null]), [
    [`${entry}-2`, 'evidence', 'background', 'family'],
    [`${entry}-4`, 'followup', undefined, null],
  ]);
  assert.deepEqual(t.followups.map((f) => f.text), ['לשיחה הבאה: הדיבאג']);

  const flipped = run(['--data', data, 'flip-sensitive', `${entry}-2`], { cwd });
  assert.equal(flipped.code, 0, flipped.err);
  assert.equal(JSON.parse(flipped.out).now, 'public');
  const back = run(['--data', data, 'flip-sensitive', `${entry}-2`, '--category', 'family'], { cwd });
  assert.equal(JSON.parse(back.out).now, 'sensitive');
  assert.equal(run(['--data', data, 'flip-sensitive', `${entry}-1`], { cwd }).code, 1, 'marking needs --category');
});

test('a sensitive block takes only kind and closes lines', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const input = `--- entry\nנועה חולה\n--- evidence ${noa.id} note 2026-10-30\n[פרט אישי — בתיק]\n--- sensitive health\n+score: 3\nנועה חולה\n`;
  const r = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(r.code, 1);
  assert.match(r.err, /sensitive part takes only/);
});

test('record-entry takes Assessments as blocks citing #<n> or stored ids; record-assessments writes them on their own', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const input = `--- entry
דיברתי עם נועה, היא מצאה לבד את הבאג. הדיבאג של נועה זה 4
--- evidence ${noa.id} talk 2026-10-30
+topics: דיבאג
דיברתי עם נועה, היא מצאה לבד את הבאג.
--- evidence ${noa.id} note 2026-10-30
הדיבאג של נועה זה 4
--- assessment ${noa.id} impl.debugging 4 commander
+evidence: #2, #1
המפקד קבע 4
--- assessment ${noa.id} learn.independence 3 agent
+evidence: #1
מצאה את הבאג לבד
`;
  const logged = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(logged.code, 0, logged.err);
  const { entry, assessments } = JSON.parse(logged.out);
  assert.deepEqual(assessments, [`${entry}-3`, `${entry}-4`]);
  const t = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  assert.deepEqual(t.assessments.map((a) => [a.skill, a.score, a.author, a.reason, a.evidence]), [
    ['impl.debugging', 4, 'commander', 'המפקד קבע 4', [`${entry}-2`, `${entry}-1`]],
    ['learn.independence', 3, 'agent', 'מצאה את הבאג לבד', [`${entry}-1`]],
  ]);

  const again = run(['--data', data, 'record-assessments'], { cwd, input: `--- assessment ${noa.id} impl.debugging 3 agent\n+evidence: ${entry}-1\nבדיקה מחדש\n` });
  assert.equal(again.code, 0, again.err);
  assert.match(JSON.parse(again.out).assessments[0], /^a-\d{8}-\d{4}-[a-z0-9]{2}$/);
  const bad = run(['--data', data, 'record-assessments'], { cwd, input: `--- assessment ${noa.id} impl.debugging 3.5 agent\n+evidence: ${entry}-1\nx\n` });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /whole number/);
});

test('retract-entry withdraws the last Entry or a named one; read-trainee --retracted still shows it; hard-delete removes it', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const log = (text) => JSON.parse(run(['--data', data, 'record-entry'], { cwd, input: `--- entry\n${text}\n--- evidence ${noa.id} talk 2026-10-30\n${text}\n` }).out).entry;
  const first = log('דיברתי עם נועה בבוקר.');
  const last = run(['--data', data, 'retract-entry'], { cwd });
  assert.equal(last.code, 0, last.err);
  assert.equal(JSON.parse(last.out).entry, first);
  const second = log('דיברתי עם נועה בערב.');
  assert.equal(JSON.parse(run(['--data', data, 'retract-entry', second], { cwd }).out).entry, second);
  assert.match(run(['--data', data, 'retract-entry', first], { cwd }).err, /already retracted/);

  const read = (...flags) => JSON.parse(run(['--data', data, 'read-trainee', noa.id, ...flags], { cwd }).out);
  assert.deepEqual(read().entries, []);
  assert.deepEqual(read('--retracted').entries.map((e) => e.id).sort(), [first, second].sort());

  assert.equal(run(['--data', data, 'hard-delete'], { cwd }).code, 1, 'hard-delete names the Entry');
  assert.equal(JSON.parse(run(['--data', data, 'hard-delete', first], { cwd }).out).entry, first);
  assert.deepEqual(read('--retracted', '--since', '2026-10-01').entries.map((e) => e.id), [second]);
});
