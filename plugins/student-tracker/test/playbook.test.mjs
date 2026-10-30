// The base Playbook: its shipped data file and its consistency check (ticket 23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkPlaybook } from '../lib/playbook.mjs';

const json = (file) => JSON.parse(fs.readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const skills = json('skills.json');
const playbook = json('playbook.json');

test('the shipped base Playbook passes its consistency check against the shipped Skill framework', () => {
  assert.deepEqual(checkPlaybook(playbook, skills), []);
});

test('the shipped base Playbook is the reviewed content: every Skill has a weak and a strong sign, a tip and Talk questions; a general set', () => {
  assert.equal(playbook.seed, undefined, 'the seed flag is gone');
  assert.ok(playbook.items.every((i) => i.origin === 'base'));
  for (const skill of skills.groups.flatMap((g) => g.skills)) {
    const mine = playbook.items.filter((i) => i.skills.includes(skill.id));
    const of = (kind, band) => mine.filter((i) => i.kind === kind && (!band || i.band === band)).length;
    assert.ok(of('sign', 'low') && of('sign', 'high'), `${skill.id}: a weak and a strong sign`);
    assert.ok(of('tip') && of('talk-question') >= 2, `${skill.id}: tips and Talk questions`);
  }
  const general = playbook.items.filter((i) => i.skills.includes('general'));
  assert.ok(general.length >= 10, `${general.length} general items`);
});

test('the seed set\'s ids stay retired, so no shipped id ever names another text', () => {
  for (let n = 1; n <= 17; n++) assert.ok(playbook.retired.includes(`b-${String(n).padStart(3, '0')}`));
});

const item = (extra = {}) => ({ id: 'b-001', origin: 'base', kind: 'tip', skills: ['impl.debugging'], text: 'טיפ', ...extra });
const problems = (items, retired = []) => checkPlaybook({ version: 1, retired, items }, skills);

test('the check refuses repeated and reused ids, and ids not of the form b-<number>', () => {
  assert.match(problems([item(), item()]).join('\n'), /b-001.*twice/);
  assert.match(problems([item()], ['b-001']).join('\n'), /b-001.*retired/);
  assert.match(problems([item({ id: 'debug-1' })]).join('\n'), /debug-1/);
});

test('the check refuses an unknown Skill, "general" with a Skill, and no Skill at all', () => {
  assert.match(problems([item({ skills: ['impl.debuging'] })]).join('\n'), /impl\.debuging/);
  assert.match(problems([item({ skills: ['general', 'impl.debugging'] })]).join('\n'), /general/);
  assert.match(problems([item({ skills: [] })]).join('\n'), /b-001/);
});

test('the check refuses an unknown kind or band, a band on a general item, an empty text and another origin', () => {
  assert.match(problems([item({ kind: 'question' })]).join('\n'), /question/);
  assert.match(problems([item({ band: 'top' })]).join('\n'), /top/);
  assert.match(problems([item({ skills: ['general'], band: 'low' })]).join('\n'), /general/);
  assert.match(problems([item({ text: ' ' })]).join('\n'), /text/);
  assert.match(problems([item({ origin: 'commander' })]).join('\n'), /origin/);
  assert.match(problems([item({ extra: 1 })]).join('\n'), /extra/);
});
