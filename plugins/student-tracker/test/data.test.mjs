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
