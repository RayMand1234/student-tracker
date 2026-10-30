import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const skills = JSON.parse(fs.readFileSync(new URL('../data/skills.json', import.meta.url), 'utf8'));
const all = skills.groups.flatMap((g) => g.skills.map((s) => ({ ...s, group: g.id })));

test('Skill framework has four ordered Stages plus the Interpersonal group', () => {
  assert.deepEqual(
    skills.groups.map((g) => [g.name, g.kind]),
    [
      ['למידה ותאוריה', 'stage'],
      ['הבנת הבעיה', 'stage'],
      ['תכנון הקוד', 'stage'],
      ['מימוש בקוד', 'stage'],
      ['בין-אישי', 'group'],
    ],
  );
  assert.equal(all.length, 31);
});

test('every Skill id is unique and prefixed by its Stage or group id', () => {
  const ids = all.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of all) assert.match(s.id, new RegExp(`^${s.group}\\.[a-z0-9-]+$`));
});

test('the same name in two Stages is two Skills with two ids', () => {
  const order = all.filter((s) => s.name === 'סדר וארגון').map((s) => s.id);
  assert.deepEqual(order, ['learn.organization', 'plan.organization', 'impl.organization']);
});

const preset = JSON.parse(fs.readFileSync(new URL('../data/preset.json', import.meta.url), 'utf8'));
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

test('the Course preset lists the reference Subjects in order and its Tests by canonical name', () => {
  assert.deepEqual(preset.subjects.map((s) => s.name), [
    'שקי חול', 'תכנות בסיסי', 'OOP', 'DB', 'Deployment', 'Frontend', 'Backend', 'Express', 'JS ו-TS', 'React',
  ]);
  assert.equal(preset.tests.length, 21);
  const fov = preset.tests.find((t) => t.name === 'FOV');
  assert.deepEqual([fov.subject, fov.number, fov.aliases], ['tabi', '4', ['פוב']]);
  assert.deepEqual(preset.projects.map((p) => p.name), ['Interpreter', 'Padens', 'MZ']);
});

test('every Test, Project and Schedule week points at a Subject or Project that exists', () => {
  const subjects = new Set(preset.subjects.map((s) => s.id));
  const projects = new Set(preset.projects.map((p) => p.id));
  for (const t of preset.tests) assert.ok(subjects.has(t.subject), `${t.name}: ${t.subject}`);
  for (const p of preset.projects) assert.ok(subjects.has(p.subject), `${p.name}: ${p.subject}`);
  assert.deepEqual(preset.schedule.map((w) => w.week), Array.from({ length: 21 }, (_, i) => i + 1));
  for (const w of preset.schedule) {
    for (const s of w.subjects) assert.ok(subjects.has(s), `week ${w.week}: ${s}`);
    for (const p of w.projects ?? []) assert.ok(projects.has(p), `week ${w.week}: ${p}`);
  }
});

test('preset ids are unique, and no name or alias points at two Subjects, Tests or Projects', () => {
  for (const list of [preset.subjects, preset.tests, preset.projects]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const list of [preset.subjects, preset.tests, preset.projects]) {
    const names = list.flatMap((x) => [x.name, ...x.aliases].map(norm));
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(twice, []);
  }
});
