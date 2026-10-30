import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDashboard } from '../scripts/build-dashboard.mjs';
import { archiveOf } from '../dashboard/derive.mjs';

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
});

test('an archived Cycle is shown frozen on the day it was archived; a live one is not archived', () => {
  assert.deepEqual(archiveOf({ name: 'הצהובים', archived: true, archivedAt: '2026-10-30T09:15:00+02:00' }), { day: '2026-10-30' });
  assert.deepEqual(archiveOf({ name: 'הצהובים', archived: true }), { day: null }, 'archived, day unknown');
  assert.equal(archiveOf({ name: 'הכתומים', archived: false }), null);
  assert.equal(archiveOf(undefined), null);
});
