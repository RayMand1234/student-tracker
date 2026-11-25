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

test('the skills are setup, tracker, the five shortcuts, the two Herzl skills and weboneh-fetch', () => {
  assert.deepEqual(fs.readdirSync(SKILLS).filter((n) => !n.startsWith('.')).sort(), ['brief', 'dashboard', 'hertzl-fetch', 'hertzl-post', 'mind', 'research', 'setup', 'status', 'tracker', 'weboneh-fetch']);
  assert.ok(skill('tracker').meta.description.length <= 1024);
  assert.equal(skill('tracker').meta['disable-model-invocation'], undefined, 'tracker auto-triggers');
});

// Herzl has no API of its own: both skills share one recipe (a signed-in Chrome tab), and posting
// is the only one that touches the tracker (reads) and Herzl (a write).
test('/hertzl-fetch and /hertzl-post are user-only, share the api recipe, and /hertzl-fetch never writes to Herzl', () => {
  const api = fs.readFileSync(path.join(SKILLS, 'hertzl-fetch/references/api.md'), 'utf8');
  for (const name of ['hertzl-fetch', 'hertzl-post']) {
    const { meta, body } = skill(name);
    assert.equal(meta.name, name);
    assert.equal(meta['disable-model-invocation'], 'true');
    assert.equal(meta.model, 'sonnet', 'Hebrew writing and merge judgment: not haiku');
    assert.match(body, /skills\/hertzl-fetch\/references\/api\.md/);
    assert.ok(meta['allowed-tools'].split(', ').includes('mcp__claude-in-chrome__javascript_tool'));
  }
  assert.doesNotMatch(skill('hertzl-fetch').body, /H\.post/, 'fetch never writes to Herzl');
  assert.match(skill('hertzl-fetch').body, /boot log`$/m, 'fetch records through the tracker\'s logging rules');
  assert.match(skill('hertzl-fetch').body, /`discipline`.*`\+herzl:`|`\+herzl:`/s);
  assert.match(skill('hertzl-post').body, /boot recall`$/m);
  assert.match(skill('hertzl-post').body, /already posted|כבר ברצל/);
  assert.match(api, /interactions\/staff/);
  assert.match(api, /isEncoded: true/);
  assert.doesNotMatch(api, /eyJ/, 'no token in the recipe');
});

// Weboneh has its own recipe (a signed-in Chrome tab, bare token header) and reuses Herzl's browser
// steps. It never writes to Weboneh; it records into the tracker (Evidence, then Ratings and
// conclusions) under the tracker's own rules, which it loads rather than restates.
test('/weboneh-fetch is user-only, records through the tracker\'s rules, and its recipe parses and holds no token', () => {
  const { meta, body } = skill('weboneh-fetch');
  const api = fs.readFileSync(path.join(SKILLS, 'weboneh-fetch/references/api.md'), 'utf8');
  assert.equal(meta.name, 'weboneh-fetch');
  assert.equal(meta['disable-model-invocation'], 'true');
  assert.equal(meta.model, 'sonnet', 'Hebrew writing and judgment: not haiku');
  assert.match(body, /skills\/weboneh-fetch\/references\/api\.md/);
  assert.ok(meta['allowed-tools'].split(', ').includes('mcp__claude-in-chrome__javascript_tool'));
  assert.ok(meta['allowed-tools'].split(', ').includes('Bash(student-tracker-store *)'), 'records into the tracker');
  assert.match(body, /boot log`$/m, 'records through the tracker\'s logging rules');
  assert.match(body, /`\+weboneh:`/, 'a re-run finds what it already recorded');
  for (const rule of ['assess.md', 'state.md']) {
    assert.match(body, new RegExp(`references/${rule.replace('.', '\\.')}`));
    assert.ok(fs.existsSync(path.join(SKILLS, 'tracker/references', rule)), `${rule} exists`);
  }
  assert.doesNotMatch(body, /W\.post|method:\s*'(POST|PUT|PATCH|DELETE)'/, 'Weboneh is never written to');
  assert.match(api, /skills\/hertzl-fetch\/references\/api\.md/);
  assert.match(api, /no `Bearer `/);
  assert.doesNotMatch(api, /eyJ/, 'no token in the recipe');
  assert.doesNotMatch(api, /method:\s*'(POST|PUT|PATCH|DELETE)'/, 'Weboneh is never written to');
  const code = api.match(/```js\n([\s\S]*?)```/)[1];
  assert.doesNotThrow(() => new Function(code), 'the helper block is valid JavaScript');
});

// Each shortcut injects the tracker's instructions (and its route) at load time through `boot`,
// so the slash command spends no model turn on the Skill tool or on reading files.
const ROUTE = { brief: 'brief', status: 'status', dashboard: '', research: 'research', mind: 'mind' };
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

// Sonnet for tracking, recording and summaries (Haiku was too weak at both); the judgment-heavy routes (re-rate, research, advice)
// run on a stronger one: inline in /research, else in the plugin's analyst agent.
test('tracker, brief and status run on sonnet, dashboard on haiku, /research and the analyst agent on opus, and the tracker hands ★ routes to the agent', () => {
  for (const name of ['tracker', 'brief', 'status', 'mind']) assert.equal(skill(name).meta.model, 'sonnet', name);
  assert.equal(skill('dashboard').meta.model, 'haiku');
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
