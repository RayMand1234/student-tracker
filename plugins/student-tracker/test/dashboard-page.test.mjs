import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDashboard } from '../scripts/build-dashboard.mjs';

const published = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');

test('the published page is built from the current sources (run `npm run build`)', () => {
  assert.equal(published, buildDashboard());
});

test('the page never reads raw Entries or sensitive records', () => {
  assert.doesNotMatch(published, /['"`](entries|sensitive)['"`/]/);
});

test('the page has no <title>, so the publish title "מעקב חניכים · <Cycle>" names it', () => {
  assert.doesNotMatch(published, /<title>/i);
});

test('the page only reads: it never writes to the database', () => {
  assert.doesNotMatch(published, /\.(set|update|delete|add|acquire)\(/);
});

test('an archived Cycle\'s page says so: the read-only "מחזור בארכיון" banner', () => {
  assert.match(published, /מחזור בארכיון/);
  assert.match(published, /cycle\?\.archived/);
});
