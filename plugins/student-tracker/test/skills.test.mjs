// The plugin's skill surface (spec, Packaging): `tracker` auto-triggers; `brief`, `status` and
// `dashboard` are user-only shortcuts of a few lines that hand off to `tracker` by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills');

function skill(name) {
  const text = fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
  const [, head, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = Object.fromEntries(head.split('\n').filter((l) => /^[\w-]+:/.test(l)).map((l) => {
    const [, k, v] = l.match(/^([\w-]+):\s*(.*)$/);
    return [k, v.replace(/^"(.*)"$/, '$1')];
  }));
  return { meta, body };
}

test('the five skills are setup, tracker and the three shortcuts', () => {
  assert.deepEqual(fs.readdirSync(SKILLS).sort(), ['brief', 'dashboard', 'setup', 'status', 'tracker']);
  assert.ok(skill('tracker').meta.description.length <= 1024);
  assert.equal(skill('tracker').meta['disable-model-invocation'], undefined, 'tracker auto-triggers');
});

for (const name of ['brief', 'status', 'dashboard']) {
  test(`/${name} is a user-only shortcut that hands off to tracker by name, passing its arguments`, () => {
    const { meta, body } = skill(name);
    assert.equal(meta.name, name);
    assert.ok(meta.description);
    assert.equal(meta['disable-model-invocation'], 'true');
    assert.ok(meta['argument-hint'] !== undefined);
    assert.match(body, /student-tracker:tracker/);
    assert.match(body, /\$ARGUMENTS/);
    assert.doesNotMatch(body, /\.md|references\/|\.\.\//, 'by skill name, never by file path');
    assert.ok(body.trim().split('\n').length <= 8, 'a few lines');
  });
}
