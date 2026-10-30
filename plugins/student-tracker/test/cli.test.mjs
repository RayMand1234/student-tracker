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

test('create-cycle takes the role, start date and Talk values; the Cycle stays in progress until finish-setup', () => {
  const { data, cwd } = fresh();
  const input = `${SETUP}role: מפ"צ\nstart: 2026-10-25\ntarget: 7\nred: 12\n`;
  const created = run(['--data', data, 'create-cycle'], { cwd, input });
  assert.equal(created.code, 0, created.err);
  const { cycle, commander } = JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out);
  assert.deepEqual([cycle.start, cycle.setup, commander.settings.role], ['2026-10-25', 'in-progress', 'מפ"צ']);
  assert.deepEqual(commander.settings.talk, { target: 7, yellow: 10, red: 12 });

  const finished = run(['--data', data, 'finish-setup'], { cwd });
  assert.equal(finished.code, 0, finished.err);
  assert.equal(JSON.parse(run(['--data', data, 'connect'], { cwd }).out).setup, 'done');

  const bad = run(['--data', fresh().data, 'create-cycle'], { cwd, input: `${SETUP}yellow: 20\n` });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /before red/);
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

test('update-trainee adds, relabels and marks a Trainee as left, from plain-text lines', () => {
  const { data, cwd } = fresh();
  const [noa, dani] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const added = run(['--data', data, 'update-trainee'], { cwd, input: 'add: נועה ל.\n' });
  assert.equal(added.code, 0, added.err);
  assert.match(JSON.parse(added.out).id, /^t-/);
  assert.equal(run(['--data', data, 'update-trainee', noa.id], { cwd, input: 'rename: נועה כהן\n' }).code, 0);
  const left = run(['--data', data, 'update-trainee', dani.id], { cwd, input: 'leave: 2026-10-29\nhow: transfer\nreason: עבר לקורס אחר\n' });
  assert.equal(left.code, 0, left.err);
  assert.deepEqual(JSON.parse(left.out).left, { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' });

  const talk = `--- entry\nדיברתי עם דני\n--- evidence ${dani.id} talk 2026-10-30\nדיברתי עם דני\n`;
  const refused = run(['--data', data, 'record-entry'], { cwd, input: talk });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /left on 2026-10-29/);
  assert.equal(run(['--data', data, 'record-entry', '--insist'], { cwd, input: talk }).code, 0);
  assert.equal(run(['--data', data, 'update-trainee', dani.id], { cwd, input: 'rejoin\n' }).code, 0);
  const team = JSON.parse(run(['--data', data, 'read-team'], { cwd }).out);
  assert.deepEqual(team.map((t) => [t.name, t.active]).sort(), [['דני', true], ['נועה כהן', true], ['נועה ל.', true]]);
});

test('update-settings changes name, role and Talk thresholds', () => {
  const { data, cwd } = fresh();
  run(['--data', data, 'create-cycle'], { cwd, input: SETUP });
  const r = run(['--data', data, 'update-settings'], { cwd, input: 'role: מפ"צ\ntarget: 7\nyellow: 9\nred: 12\n' });
  assert.equal(r.code, 0, r.err);
  const { settings } = JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out).commander;
  assert.deepEqual([settings.name, settings.role, settings.talk], ['רז', 'מפ"צ', { target: 7, yellow: 9, red: 12 }]);
  const bad = run(['--data', data, 'update-settings'], { cwd, input: 'target: שבוע\n' });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /whole number of days/);
});

test('update-cycle edits the preset, Skills and Project teams, one change per call', () => {
  const { data, cwd } = fresh();
  const [noa, dani] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const ok = (input) => {
    const r = run(['--data', data, 'update-cycle'], { cwd, input });
    assert.equal(r.code, 0, r.err);
    return JSON.parse(r.out);
  };
  ok('edit-test: פוב\nname: FOV2\nnumber: 6\nalias: פוב2\n');
  ok('remove-test: Atom\n');
  ok('add-project: Chess\nsubject: oop\nalias: שחמט\n');
  ok('week: 6\nsubjects: oop, db\nprojects: chess\n');
  ok('remove-project: מז\n');
  ok('remove-week: 21\n');
  const { skill } = ok('add-skill: ניהול זמן\ngroup: impl\n');
  ok('archive-skill: impl.web-search\n');
  ok('restore-skill: impl.web-search\n');
  const team = ok(`team: בנק א\nproject: padens\nmember: ${noa.id}\nmember: ${dani.id}\n`);
  ok(`team: בנק א\nid: ${team.id}\nproject: padens\nmember: ${noa.id}\n`);

  const cycle = JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out);
  const fov = cycle.preset.tests.find((t) => t.id === 'tabi.fov');
  assert.deepEqual([fov.name, fov.number], ['FOV2', '6']);
  assert.equal(cycle.preset.tests.some((t) => t.name === 'Atom'), false);
  assert.deepEqual(cycle.preset.schedule.find((w) => w.week === 6), { week: 6, subjects: ['oop', 'db'], projects: ['chess'] });
  assert.equal(cycle.preset.projects.some((p) => p.id === 'mz'), false);
  assert.equal(cycle.preset.schedule.length, 20);
  assert.ok(cycle.skills.groups.find((g) => g.id === 'impl').skills.some((s) => s.id === skill.id));
  assert.deepEqual(cycle.teams.map((t) => t.members), [[noa.id]]);

  const two = run(['--data', data, 'update-cycle'], { cwd, input: 'remove-test: Flame\nadd-skill: x\n' });
  assert.equal(two.code, 1);
  assert.match(two.err, /one change per call/);
});

test('record-entry takes improve/keep items, Status, stage, Snapshot and retirements as blocks; update-trainee takes a Commander Status', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const text = 'נועה עלתה לרף מקס. שיפור: להגיע בזמן.';
  const input = `--- entry
${text}
--- evidence ${noa.id} evaluation-event 2026-10-30
נועה עלתה לרף מקס.
--- evidence ${noa.id} improve-keep 2026-10-30
שיפור: להגיע בזמן.
--- item ${noa.id} improve commander
+from: #2
להגיע בזמן
--- item ${noa.id} keep agent
+from: #2
מקבלת משוב בפתיחות
--- stage ${noa.id}
+to: רף מקס
+evidence: #1
--- status ${noa.id} concern
+evidence: #1, #2
נכנסה לתהליך הערכה
--- snapshot ${noa.id}
בתהליך הערכה; מתקשה בזמנים.
`;
  const logged = run(['--data', data, 'record-entry'], { cwd, input });
  assert.equal(logged.code, 0, logged.err);
  const r = JSON.parse(logged.out);
  let t = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  assert.deepEqual([t.card.evalStage, t.card.status.value, t.card.status.by, t.card.snapshot.text], ['רף מקס', 'concern', 'agent', 'בתהליך הערכה; מתקשה בזמנים.']);
  assert.deepEqual(t.card.items.map((i) => [i.kind, i.text, i.by]), [['improve', 'להגיע בזמן', 'commander'], ['keep', 'מקבלת משוב בפתיחות', 'agent']]);

  const done = 'נועה מגיעה בזמן, אפשר להוריד.';
  const retired = run(['--data', data, 'record-entry'], { cwd, input: `--- entry
${done}
--- evidence ${noa.id} note 2026-10-30
${done}
--- retire ${noa.id} ${r.items[0]} commander
+evidence: #1
מגיעה בזמן
--- stage ${noa.id}
+to: none
+evidence: #1
` });
  assert.equal(retired.code, 1, 'a note is not the Commander\'s word on the evaluation process');
  assert.match(retired.err, /evaluation-event/);

  const ok = run(['--data', data, 'record-entry'], { cwd, input: `--- entry
${done}
--- evidence ${noa.id} note 2026-10-30
${done}
--- retire ${noa.id} ${r.items[0]} commander
+evidence: #1
מגיעה בזמן
` });
  assert.equal(ok.code, 0, ok.err);

  const status = run(['--data', data, 'update-trainee', noa.id], { cwd, input: `status: watch
reason: אישור הצעה: משתפרת
evidence: ${r.evidence[1]}
` });
  assert.equal(status.code, 0, status.err);
  t = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  const change = t.changes.find((c) => c.type === 'status' && c.by === 'commander');
  assert.deepEqual([change.from, change.to, change.reason, change.evidence], ['concern', 'watch', 'אישור הצעה: משתפרת', [r.evidence[1]]]);
  assert.equal(t.card.items.length, 1, 'the retired item left the card');
});

test('next-Talk questions are a block of one question per line, in record-entry and record-assessments; read-playbook picks items', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: SETUP }).out).trainees;
  const text = 'דיברתי עם נועה, היא נתקעה על באג שעה ולא שאלה.';
  const logged = run(['--data', data, 'record-entry'], { cwd, input: `--- entry
${text}
--- evidence ${noa.id} talk 2026-10-30
${text}
--- assessment ${noa.id} impl.debugging 2 agent
+evidence: #1
נתקעה שעה בלי לבודד
--- next-talk ${noa.id}
מה ניסית לפני ששאלת?
איך תדעי מתי לבקש עזרה?
` });
  assert.equal(logged.code, 0, logged.err);
  const { evidence } = JSON.parse(logged.out);
  let card = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out).card;
  assert.deepEqual(card.nextTalk.questions, ['מה ניסית לפני ששאלת?', 'איך תדעי מתי לבקש עזרה?']);

  const rerated = run(['--data', data, 'record-assessments'], { cwd, input: `--- assessment ${noa.id} impl.debugging 3 commander
+evidence: ${evidence[0]}
בדיקה מחדש
--- next-talk ${noa.id}
מה עזר לך הפעם?

על מה נעבוד עכשיו?
` });
  assert.equal(rerated.code, 0, rerated.err);
  // (Both writes may fall in the same second here, so check the record, not which one the card shows.)
  const [change] = JSON.parse(rerated.out).changes;
  const { changes } = JSON.parse(run(['--data', data, 'read-trainee', noa.id], { cwd }).out);
  assert.deepEqual(changes.find((c) => c.id === change).questions, ['מה עזר לך הפעם?', 'על מה נעבוד עכשיו?']);

  const picked = run(['--data', data, 'read-playbook', noa.id, 'impl.debugging', 'inter.communication'], { cwd });
  assert.equal(picked.code, 0, picked.err);
  const { targets, general } = JSON.parse(picked.out);
  assert.deepEqual(targets.map((t) => [t.skill, t.rating]), [['impl.debugging', 3], ['inter.communication', null]]);
  assert.ok(targets[0].items.every((i) => i.band === null || i.band === 'mid'));
  assert.ok(general.length > 0);
  assert.equal(JSON.parse(run(['--data', data, 'read-playbook', noa.id], { cwd }).out).targets[0].skill, 'impl.debugging');
});

test('the brief stores its questions with record-next-talk; read-status and take-alert serve team status and alerts', () => {
  const { data, cwd } = fresh();
  const [noa] = JSON.parse(run(['--data', data, 'create-cycle'], { cwd, input: `${SETUP}start: 2026-01-01\n` }).out).trainees;
  const stored = run(['--data', data, 'record-next-talk'], { cwd, input: `--- next-talk ${noa.id}
מה עזר לך למצוא את הבאג לבד?
איך הולך בצוות?
` });
  assert.equal(stored.code, 0, stored.err);
  assert.deepEqual(JSON.parse(stored.out).card.nextTalk.questions, ['מה עזר לך למצוא את הבאג לבד?', 'איך הולך בצוות?']);
  const refused = run(['--data', data, 'record-next-talk'], { cwd, input: `--- assessment ${noa.id} impl.debugging 3 agent\n+evidence: x\nסיבה\n` });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /next-talk/);

  const status = JSON.parse(run(['--data', data, 'read-status'], { cwd }).out);
  assert.deepEqual(status.needTalk.map((t) => [t.name, t.days]), [['דני', null], ['נועה כ.', null]]);

  // No Talk since the start, months ago: both are red; the pattern comes after them.
  const alerts = [];
  for (;;) {
    const r = run(['--data', data, 'take-alert', noa.id, 'מגיעה', 'באיחור'], { cwd });
    assert.equal(r.code, 0, r.err);
    const { alert } = JSON.parse(r.out);
    if (!alert) break;
    alerts.push(alert.kind === 'pattern' ? alert.theme : alert.name);
  }
  assert.deepEqual(alerts, ['דני', 'נועה כ.', 'מגיעה באיחור']);
});

test('save-playbook-item takes "+key: value" lines and the text; retire, hide and unhide take an id', () => {
  const { data, cwd } = fresh();
  run(['--data', data, 'create-cycle'], { cwd, input: SETUP });
  const text = 'לבקש ממנה להסביר לי את הקוד בקול,\nלפני שאני מסתכל עליו.';
  const saved = run(['--data', data, 'save-playbook-item'], { cwd, input: `+kind: tip
+skills: impl.debugging, inter.communication
+band: low
${text}
` });
  assert.equal(saved.code, 0, saved.err);
  const item = JSON.parse(saved.out);
  assert.deepEqual([item.kind, item.skills, item.band, item.text, item.source], ['tip', ['impl.debugging', 'inter.communication'], 'low', text, null]);

  const edited = run(['--data', data, 'save-playbook-item', item.id], { cwd, input: '+band: none\n' });
  assert.equal(edited.code, 0, edited.err);
  assert.deepEqual([JSON.parse(edited.out).band, JSON.parse(edited.out).text], [null, text]);

  const bad = run(['--data', data, 'save-playbook-item'], { cwd, input: '+kind: tip\n+level: low\nטקסט\n' });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /level/);

  assert.equal(run(['--data', data, 'retire-playbook-item', item.id], { cwd }).code, 0);
  assert.equal(JSON.parse(run(['--data', data, 'read-cycle'], { cwd }).out).playbook[0].retired.at.slice(0, 4), new Date().getFullYear().toString());
  assert.deepEqual(JSON.parse(run(['--data', data, 'hide-playbook-item', 'b-189'], { cwd }).out), { hidden: ['b-189'] });
  assert.deepEqual(JSON.parse(run(['--data', data, 'unhide-playbook-item', 'b-189'], { cwd }).out), { hidden: [] });
});

test('a new Cycle by the CLI: create-cycle with "previous:", copy-commander-scope and archive-cycle take the old address; --cycle reads it', () => {
  const { data, cwd } = fresh();
  const cli = (args, input) => run(['--data', data, ...args], { cwd, input });
  const old = JSON.parse(cli(['create-cycle'], SETUP).out).url;
  cli(['finish-setup']);
  assert.equal(cli(['hide-playbook-item', 'b-189']).code, 0);

  const created = cli(['create-cycle'], `commander: רז\ncycle: הכתומים\ntrainee: מאיה\nprevious: ${old}\n`);
  assert.equal(created.code, 0, created.err);
  const copied = cli(['copy-commander-scope', old]);
  assert.equal(copied.code, 0, copied.err);
  assert.deepEqual(JSON.parse(copied.out).hidden, ['b-189']);
  assert.equal(cli(['archive-cycle', old]).code, 0);
  assert.equal(cli(['finish-setup']).code, 0);

  assert.equal(JSON.parse(cli(['connect']).out).cycle, 'הכתומים');
  const archived = JSON.parse(cli(['--cycle', old, 'read-cycle']).out).cycle;
  assert.deepEqual([archived.name, archived.archived], ['הצהובים', true]);
  assert.deepEqual(JSON.parse(cli(['--cycle', old, 'read-team']).out).map((t) => t.name).sort(), ['דני', 'נועה כ.']);
  const refused = cli(['--cycle', old, 'update-trainee'], 'add: אור\n');
  assert.equal(refused.code, 1);
  assert.match(refused.err, /בארכיון.*הכתומים/);
});
