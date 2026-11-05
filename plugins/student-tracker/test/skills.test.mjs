// The plugin's skill surface (spec, Packaging): `tracker` auto-triggers; `brief`, `status`,
// `dashboard` and `research` are user-only shortcuts of a few lines that load `tracker` through `boot`.
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

test('the six skills are setup, tracker and the four shortcuts', () => {
  assert.deepEqual(fs.readdirSync(SKILLS).filter((n) => !n.startsWith('.')).sort(), ['brief', 'dashboard', 'research', 'setup', 'status', 'tracker']);
  assert.ok(skill('tracker').meta.description.length <= 1024);
  assert.equal(skill('tracker').meta['disable-model-invocation'], undefined, 'tracker auto-triggers');
});

// Each shortcut injects the tracker's instructions (and its route) at load time through `boot`,
// so the slash command spends no model turn on the Skill tool or on reading files.
const ROUTE = { brief: 'brief', status: 'status', dashboard: '', research: 'research' };
for (const name of Object.keys(ROUTE)) {
  test(`/${name} is a user-only shortcut that loads tracker through boot, passing its arguments`, () => {
    const { meta, body } = skill(name);
    assert.equal(meta.name, name);
    assert.ok(meta.description);
    assert.equal(meta['disable-model-invocation'], 'true');
    assert.ok(meta['argument-hint'] !== undefined);
    const route = ROUTE[name] ? ` ${ROUTE[name]}` : '';
    assert.ok(body.includes(`!\`student-tracker-store --data "\${CLAUDE_PLUGIN_DATA}" boot${route} --tracker\``), body);
    for (const tool of skill('tracker').meta['allowed-tools'].split(', ').filter((t) => !/^Web/.test(t) || name === 'research')) {
      assert.ok(meta['allowed-tools'].split(', ').includes(tool), `${name} allows ${tool}`);
    }
    assert.match(body, /\$ARGUMENTS/);
    assert.doesNotMatch(body, /\.md|references\/|\.\.\//, 'never by file path');
    assert.ok(body.trim().split('\n').length <= 8, 'a few lines');
  });
}

test('tracker injects the pointer and store cores at load, as its last line', () => {
  const { body } = skill('tracker');
  assert.ok(body.trimEnd().endsWith('!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot`'));
});

test('tracker may search the web, and routes online research to its reference', () => {
  const { meta, body } = skill('tracker');
  assert.match(meta['allowed-tools'], /\bWebSearch\b/);
  assert.match(meta['allowed-tools'], /\bWebFetch\b/);
  assert.match(body, /\(references\/research\.md\)/);
  const research = fs.readFileSync(path.join(SKILLS, 'tracker/references/research.md'), 'utf8');
  assert.match(research, /nothing about the Trainee leaves for the web/, 'the privacy rule comes first');
});

// Cheap model for reading and recording; the judgment-heavy routes (re-rate, research, advice)
// run on a stronger one: inline in /research, else in the plugin's analyst agent.
test('skills run on haiku, /research and the analyst agent on opus, and the tracker hands ★ routes to the agent', () => {
  for (const name of ['tracker', 'brief', 'status', 'dashboard']) assert.equal(skill(name).meta.model, 'haiku', name);
  assert.equal(skill('research').meta.model, 'opus');
  const agent = fs.readFileSync(path.join(SKILLS, '../agents/analyst.md'), 'utf8');
  assert.match(agent, /^model: opus$/m);
  assert.match(agent, /boot <route> --tracker/);
  const { meta, body } = skill('tracker');
  assert.ok(meta['allowed-tools'].split(', ').includes('Agent'));
  assert.match(body, /subagent_type: "student-tracker:analyst"/);
  const starred = body.split('\n').filter((l) => l.includes('★ [')).map((l) => l.match(/★ \[(\w+)\.md\]/)[1]).sort();
  assert.deepEqual(starred, ['advice', 'assess', 'research']);
});
