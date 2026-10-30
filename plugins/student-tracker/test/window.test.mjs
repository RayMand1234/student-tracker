// The Trainee window (click a Talk circle): what the derivation module hands the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { traineeWindow, talkColor, MARK, DEFAULT_TALK } from '../dashboard/derive.mjs';

const SKILLS = JSON.parse(fs.readFileSync(new URL('../data/skills.json', import.meta.url), 'utf8'));
const PRESET = JSON.parse(fs.readFileSync(new URL('../data/preset.json', import.meta.url), 'utf8'));
const TALK = DEFAULT_TALK;
const TODAY = '2026-10-30';

const card = (extra = {}) => ({
  id: 't-1', name: 'נועה', active: true, left: null, status: null, evalStage: null, lastTalk: '2026-10-25',
  snapshot: null, items: [], followups: [], nextTalk: null, skills: {}, ...extra,
});
const ev = (id, kind, date, excerpt, extra = {}) => ({ id, kind, date, excerpt, retracted: false, ...extra });
const view = (c, extra = {}) => traineeWindow(c, { skills: SKILLS, preset: PRESET, teams: [], evidence: [], today: TODAY, talk: TALK, ...extra });

test('the window header takes the Talk circle\'s colour; Snapshot and Status come from the card', () => {
  const w = view(card({
    snapshot: { text: 'מתקדמת יפה בדיבאג.', at: '2026-10-29T10:00:00+02:00' },
    status: { value: 'watch', by: 'agent', reason: 'לא הגישה שבוע', at: '2026-10-29T10:00:00+02:00' },
    evalStage: 'רף מקס',
  }));
  assert.deepEqual(w.color, talkColor(5, TALK));
  assert.equal(w.days, 5);
  assert.equal(w.snapshot.text, 'מתקדמת יפה בדיבאג.');
  assert.deepEqual(w.status, { value: 'watch', label: 'במעקב', by: 'agent', reason: 'לא הגישה שבוע' });
  assert.equal(w.evalStage, 'רף מקס');
  assert.equal(view(card()).status, null);
  assert.equal(view(card({ status: { value: 'good', by: 'commander', reason: 'x', at: '' } })).status.label, 'במסלול');
  assert.equal(view(card({ status: { value: 'concern', by: 'agent', reason: 'x', at: '' } })).status.label, 'דורש טיפול');
});

const group = (w, id) => w.groups.find((g) => g.id === id);
const sizeOf = (id) => SKILLS.groups.find((g) => g.id === id).skills.length;

test('Skills per Stage: rated ones with their Rating, the rest counted as "ללא תיעוד"; the Interpersonal group last', () => {
  const w = view(card({
    skills: {
      'impl.debugging': { a: [['2026-10-01', 2, 'agent'], ['2026-10-28', 4, 'agent']], n: 2 },
      'inter.teamwork': { a: [['2026-09-01', 3, 'commander']], n: 1 },
    },
  }));
  assert.deepEqual(w.groups.map((g) => g.id), ['learn', 'problem', 'plan', 'impl', 'inter']);
  const impl = group(w, 'impl');
  assert.equal(impl.rated.length, 1);
  assert.deepEqual(
    [impl.rated[0].name, impl.rated[0].rating.score, impl.rated[0].rating.trend, impl.rated[0].rating.n],
    ['יכולות דיבאג', 4, 1, 2],
  );
  assert.equal(impl.unrated, sizeOf('impl') - 1);
  const inter = group(w, 'inter').rated[0].rating;
  assert.deepEqual([inter.score, inter.author, inter.stale, inter.n], [3, 'commander', true, 1]);
  assert.equal(group(w, 'learn').unrated, sizeOf('learn'));
});

test('an archived Skill shows while it has a Rating, and is not counted as missing', () => {
  const skills = structuredClone(SKILLS);
  const impl = skills.groups.find((g) => g.id === 'impl').skills;
  impl[0] = { ...impl[0], archived: true };
  impl[1] = { ...impl[1], archived: true };
  const rated = impl[0].id;
  const w = view(card({ skills: { [rated]: { a: [['2026-10-28', 3, 'agent']], n: 1 } } }), { skills });
  assert.deepEqual(group(w, 'impl').rated.map((r) => r.id), [rated]);
  assert.equal(group(w, 'impl').unrated, impl.length - 2);
});

test('details: last Talk, Project teams, the latest goal and background, and the live Evidence count', () => {
  const teams = [
    { id: 'tm-1', project: 'padens', name: 'בנק א', members: ['t-1', 't-2'] },
    { id: 'tm-2', project: 'interpreter', name: 'זוג 3', members: ['t-1'] },
    { id: 'tm-3', project: 'padens', name: 'בנק ב', members: ['t-2'] },
  ];
  const evidence = [
    ev('e-1', 'goal', '2026-09-10', 'רוצה להיות מפקדת'),
    ev('e-2', 'goal', '2026-10-20', 'מעוניינת בפיקוד'),
    ev('e-3', 'background', '2026-09-01', `למדה מדעי המחשב שנה. ${MARK}`),
    ev('e-4', 'talk', '2026-10-25', 'דיברנו'),
    ev('e-5', 'note', '2026-10-28', 'בוטל', { retracted: true }),
  ];
  const { details } = view(card(), { teams, evidence });
  assert.deepEqual(details.lastTalk, { date: '2026-10-25', days: 5 });
  assert.deepEqual(details.teams, ['Interpreter · זוג 3', 'Padens · בנק א']);
  assert.equal(details.goal, 'מעוניינת בפיקוד');
  assert.equal(details.background, `למדה מדעי המחשב שנה. ${MARK}`);
  assert.deepEqual(details.evidence, { count: 4, last: '2026-10-25' });
  // Before the Trainee's Evidence has loaded, those details are unknown, not empty.
  const loading = view(card(), { teams, evidence: null }).details;
  assert.deepEqual([loading.goal, loading.background, loading.evidence], [null, null, null]);
  assert.deepEqual(view(card({ lastTalk: null })).details.lastTalk, null);
});

test('"לשיחה הבאה": open Follow-ups word-for-word first, then the suggested questions when the card has them', () => {
  const followups = [{ id: 'f-1', text: 'סיכמנו שתשב עם דני על זה', date: '2026-10-20' }, { id: 'f-2', text: MARK, date: '2026-10-22' }];
  const w = view(card({ followups, nextTalk: { questions: ['מה עזר לך השבוע?', 'איפה נתקעת?'], at: '2026-10-29T10:00:00+02:00' } }));
  assert.deepEqual(w.next, [
    { kind: 'followup', text: 'סיכמנו שתשב עם דני על זה', date: '2026-10-20' },
    { kind: 'followup', text: MARK, date: '2026-10-22' },
    { kind: 'question', text: 'מה עזר לך השבוע?' },
    { kind: 'question', text: 'איפה נתקעת?' },
  ]);
  assert.deepEqual(view(card()).next, []);
  assert.deepEqual(view(card({ nextTalk: { questions: [], at: '' } })).next, []);
});

test('ids the page can\'t resolve show as the marker: an unknown Project, a rated Skill the framework lacks', () => {
  const teams = [{ id: 'tm-1', project: 'gone', name: 'צוות', members: ['t-1'] }, { id: 'tm-2', project: 'padens', name: 'בלי חברים' }];
  const w = view(card({ skills: { 'impl.c-zz99': { a: [['2026-10-28', 3, 'agent']], n: 1 } } }), { teams });
  assert.deepEqual(w.details.teams, [`${MARK} · צוות`]);
  assert.deepEqual(w.groups.at(-1).rated.map((k) => [k.name, k.rating.score]), [[MARK, 3]]);
});
