// Release-ready repo (spec, Packaging and Portability): the marketplace entry and the manifest
// agree and carry no `version` (installs track commits), and the prompts stay agent-neutral:
// they name storage operations, and only the artifact mapping and setup's preflight/publish
// steps mention the Artifact tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PLUGIN, '../..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const body = (file) => fs.readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');

test('the marketplace entry and the manifest agree, and neither pins a version', () => {
  const marketplace = readJson(path.join(REPO, '.claude-plugin/marketplace.json'));
  const manifest = readJson(path.join(PLUGIN, '.claude-plugin/plugin.json'));
  assert.equal(marketplace.plugins.length, 1);
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, 'student-tracker');
  assert.equal(manifest.name, entry.name, 'manifest name = marketplace entry name');
  assert.equal(path.resolve(REPO, entry.source), PLUGIN, 'the entry points at this plugin');
  assert.match(entry.source, /^\.\//, 'a relative-path source');
  assert.equal(manifest.description, entry.description);
  assert.equal(manifest.version, undefined, 'no version in plugin.json');
  assert.equal(entry.version, undefined, 'no version in the marketplace entry');
  assert.ok(marketplace.owner?.name);
});

const REFERENCES = path.join(PLUGIN, 'skills/tracker/references');
const referenceFiles = fs.readdirSync(REFERENCES, { recursive: true })
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join(REFERENCES, f));
// Only the artifact backend's files under store/artifact/ name the Artifact tools.
const ARTIFACT = path.join(REFERENCES, 'store/artifact') + path.sep;
const neutralFiles = [
  ...['tracker', 'brief', 'status', 'dashboard', 'research'].map((s) => path.join(PLUGIN, 'skills', s, 'SKILL.md')),
  ...referenceFiles.filter((f) => !f.startsWith(ARTIFACT)),
];

for (const file of neutralFiles) {
  const name = path.relative(PLUGIN, file);
  test(`${name} names storage operations, not the Artifact tools`, () => {
    assert.doesNotMatch(body(file), /ArtifactData|Artifact tool|ToolSearch|if_version|out_dir/);
  });
}

test('reference files carry no ${CLAUDE_PLUGIN_*} substitutions (only SKILL.md text is substituted)', () => {
  for (const f of referenceFiles) {
    assert.ok(!/\$\{CLAUDE_PLUGIN_/.test(fs.readFileSync(f, 'utf8')), f);
  }
});

test('setup mentions the Artifact tools only in its preflight and publish steps', () => {
  const lines = body(path.join(PLUGIN, 'skills/setup/SKILL.md')).split('\n');
  const hits = lines.filter((l) => /ArtifactData|Artifact tool|ToolSearch/.test(l));
  assert.ok(hits.length > 0);
  for (const l of hits) {
    assert.match(l, /can create artifacts|Publish the dashboard page/, `outside preflight/publish: ${l.slice(0, 80)}`);
  }
});
