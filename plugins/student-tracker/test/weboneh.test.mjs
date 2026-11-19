// `+weboneh:` marks the Weboneh source a code-review Evidence was imported from, so a re-import
// finds it again (the same job `+herzl:` does for Herzl posts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { parseEntry } from '../lib/payload.mjs';

const SOURCE = '146983';
const SUMMARY = 'שליו,\nמבחינת מקרי ריצה הכל רץ, כל הכבוד!';
const COUNTS = 'הערות: 18 — 12 קריאות - תכנות, 5 מימוש, 1 Best Practice';
const TEXT = `Weboneh · תרץ 0 - Goldstar · 17/11 · נבדק ע"י ריי\n${SUMMARY}\n\n${COUNTS}\nש׳ 7 · קריאות - תכנות: יש להגדיר קבועים בתחילת ה scope`;

function setUp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-wb-'));
  const store = openStore({ dataDir, now: () => new Date('2026-11-18T09:00:00') });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['שליו'] });
  return { store, shalev: store.readTeam()[0].id };
}

const review = (trainee, more = {}) => ({ trainee, kind: 'code-review', date: '2026-11-17', excerpt: `${SUMMARY}\n\n${COUNTS}`, test: 'Goldstar', weboneh: SOURCE, ...more });

test('a code-review Evidence keeps the Weboneh source id it came from, and the summary with its blank line is a word-for-word excerpt', () => {
  const { store, shalev } = setUp();
  store.recordEntry({ text: TEXT, evidence: [review(shalev)] });
  const [e] = store.readTrainee(shalev).evidence;
  assert.deepEqual([e.kind, e.test, e.weboneh, e.date], ['code-review', 'Goldstar', SOURCE, '2026-11-17']);
  assert.equal(e.excerpt, `${SUMMARY}\n\n${COUNTS}`);
});

test('+weboneh is read from the payload text, is one word, and an Evidence without it has no such field', () => {
  const input = `--- entry\n${TEXT}\n--- evidence t-1 code-review 2026-11-17\n+test: Goldstar\n+weboneh: ${SOURCE}\n${SUMMARY}\n`;
  assert.equal(parseEntry(input).evidence[0].weboneh, SOURCE);
  const { store, shalev } = setUp();
  assert.throws(() => store.recordEntry({ text: TEXT, evidence: [review(shalev, { weboneh: 'two words' })] }), /weboneh/);
  store.recordEntry({ text: TEXT, evidence: [review(shalev, { weboneh: undefined })] });
  assert.equal('weboneh' in store.readTrainee(shalev).evidence[0], false);
});
