// The shared Rating fixture table, end to end on both seams: each fixture's Assessments are
// written through the store, and the page's derivation module reads the Rating off the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { rating } from '../dashboard/derive.mjs';
import { RATING_FIXTURES, TODAY } from './fixtures/ratings.mjs';

for (const { name, assessments, expect } of RATING_FIXTURES) {
  test(`Rating: ${name}`, () => {
    let minute = 0;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-rt-'));
    const store = openStore({ dataDir, now: () => new Date(`${TODAY}T09:${String(minute).padStart(2, '0')}:00`) });
    store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה'] });
    const [{ id: noa }] = store.readTeam();
    for (const [date, score, author] of assessments) {
      minute++;
      const text = `הערה ${minute}`;
      store.recordEntry({
        text,
        evidence: [{ trainee: noa, kind: author === 'trainee' ? 'self-assessment' : 'note', date, excerpt: text }],
        assessments: [{ trainee: noa, skill: 'impl.debugging', score, author, reason: 'סיבה', evidence: ['#1'] }],
      });
    }

    const r = rating(store.readTrainee(noa).card.skills['impl.debugging'], TODAY);
    assert.deepEqual(r && { score: r.score, author: r.author, trend: r.trend, stale: r.stale }, expect);
  });
}
