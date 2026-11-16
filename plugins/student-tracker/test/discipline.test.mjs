// Disciplinary notes (הערות משמעת): public `discipline` Evidence, on the card and the dashboard;
// `+herzl:` marks the Herzl post an Evidence came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { parseEntry } from '../lib/payload.mjs';
import { traineeWindow, timeline, DEFAULT_TALK } from '../dashboard/derive.mjs';

const SKILLS = JSON.parse(fs.readFileSync(new URL('../data/skills.json', import.meta.url), 'utf8'));
const POST = '5b1e9c52-0d57-4a5c-8f0e-2b7f6c1d9a10';
const TEXT = 'הגיעה באיחור לשיעור';

function setUp() {
  let minute = 0;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-disc-'));
  const store = openStore({ dataDir, now: () => new Date(`2026-11-16T09:${String(minute++).padStart(2, '0')}:00`) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה'] });
  return { store, noa: store.readTeam()[0].id };
}

const note = (trainee, date, more = {}) => ({ trainee, kind: 'discipline', date, excerpt: TEXT, type: 'איחור', severity: 'קל', ...more });
const record = (store, ev) => store.recordEntry({ text: TEXT, evidence: [ev] });

test('a discipline Evidence is public: it shows in read-trainee and on the card, oldest first; +herzl round-trips', () => {
  const { store, noa } = setUp();
  assert.deepEqual(store.readTrainee(noa).card.discipline, []);
  record(store, note(noa, '2026-11-12', { treatment: 'שיחה עם המפקד', herzl: POST }));
  record(store, note(noa, '2026-11-02', { type: 'טלפון', severity: 'חמור' }));
  const t = store.readTrainee(noa);
  const first = t.evidence.find((e) => e.date === '2026-11-12');
  assert.deepEqual([first.type, first.severity, first.treatment, first.herzl], ['איחור', 'קל', 'שיחה עם המפקד', POST]);
  assert.deepEqual(t.card.discipline.map(({ date, type, severity }) => [date, type, severity]), [
    ['2026-11-02', 'טלפון', 'חמור'], ['2026-11-12', 'איחור', 'קל'],
  ]);
  assert.deepEqual(t.sensitive, [], 'not sensitive');
  assert.equal('herzl' in t.evidence.find((e) => e.date === '2026-11-02'), false, 'no +herzl, no field');
});

test('+herzl and the discipline fields are read from the payload text', () => {
  const input = `--- entry\n${TEXT}\n--- evidence t-1 discipline 2026-11-12\n+type: איחור\n+severity: קל\n+herzl: ${POST}\n${TEXT}\n`;
  const [e] = parseEntry(input).evidence;
  assert.deepEqual([e.type, e.severity, e.herzl], ['איחור', 'קל', POST]);
});

test('a discipline Evidence needs a known type and severity; +herzl is one word; other kinds take +herzl too', () => {
  const { store, noa } = setUp();
  assert.throws(() => record(store, note(noa, '2026-11-12', { type: 'המצאה' })), /discipline type is one of/);
  assert.throws(() => record(store, note(noa, '2026-11-12', { severity: 'בינוני' })), /discipline severity is one of/);
  assert.throws(() => record(store, { ...note(noa, '2026-11-12'), type: undefined }), /discipline type/);
  assert.throws(() => record(store, note(noa, '2026-11-12', { herzl: 'two words' })), /herzl/);
  assert.throws(() => record(store, { trainee: noa, kind: 'note', date: '2026-11-12', excerpt: TEXT, type: 'איחור' }), /does not belong/);
  record(store, { trainee: noa, kind: 'note', date: '2026-11-12', excerpt: TEXT, herzl: POST });
  assert.equal(store.readTrainee(noa).evidence[0].herzl, POST);
  assert.deepEqual(store.readTrainee(noa).card.discipline, []);
});

test('a retracted discipline note leaves the card, also when the card is rebuilt', () => {
  const { store, noa } = setUp();
  record(store, note(noa, '2026-11-02'));
  record(store, note(noa, '2026-11-12'));
  store.retractEntry();
  assert.deepEqual(store.readTrainee(noa).card.discipline.map((d) => d.date), ['2026-11-02']);
  assert.deepEqual(store.rebuildCard(noa).discipline.map((d) => d.date), ['2026-11-02']);
});

test('flipped to sensitive, a discipline note leaves the card; flipped back, it returns', () => {
  const { store, noa } = setUp();
  const { evidence: [id] } = record(store, note(noa, '2026-11-12'));
  store.flipSensitive(id, { category: 'discipline' });
  assert.deepEqual(store.readTrainee(noa).card.discipline, []);
  store.flipSensitive(id);
  assert.equal(store.readTrainee(noa).card.discipline.length, 1);
});

const card = (extra = {}) => ({ id: 't-1', name: 'נועה', active: true, left: null, lastTalk: '2026-11-10', snapshot: null, items: [], followups: [], nextTalk: null, skills: {}, ...extra });
const view = (c, evidence = []) => traineeWindow(c, { skills: SKILLS, evidence, today: '2026-11-16', talk: DEFAULT_TALK });

test('the Trainee window shows the count, the latest note and the list, newest first with treatment; nothing when none', () => {
  const discipline = [{ id: 'e-1', date: '2026-11-02', type: 'טלפון', severity: 'חמור' }, { id: 'e-2', date: '2026-11-12', type: 'איחור', severity: 'קל' }];
  const { discipline: d } = view(card({ discipline }), [{ id: 'e-2', kind: 'discipline', date: '2026-11-12', retracted: false, treatment: 'שיחה' }]).details;
  assert.equal(d.count, 2);
  assert.deepEqual(d.last, { id: 'e-2', date: '2026-11-12', type: 'איחור', severity: 'קל', treatment: 'שיחה' });
  assert.deepEqual(d.list.map((n) => [n.date, n.treatment]), [['2026-11-12', 'שיחה'], ['2026-11-02', null]]);
  assert.equal(view(card()).details.discipline, null, 'an older card has none');
  assert.equal(view(card({ discipline: [] })).details.discipline, null);
});

test('the timeline labels a discipline note and details its type, severity and treatment', () => {
  const e = { id: 'e-1', kind: 'discipline', date: '2026-11-12', excerpt: 'x', retracted: false, type: 'איחור', severity: 'קל', treatment: 'שיחה' };
  const [entry] = timeline([e], [], {}).entries;
  assert.deepEqual([entry.label, entry.detail], ['הערת משמעת', 'איחור · קל · שיחה']);
});
