// The Trainee file ("לתיק המלא"): growth replay, 4-week movers, the side list and the timeline,
// as the derivation module hands them to the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { growth, fileNav, timeline, traineeFile, talkColor, DEFAULT_TALK, MARK } from '../dashboard/derive.mjs';

const SKILLS = JSON.parse(fs.readFileSync(new URL('../data/skills.json', import.meta.url), 'utf8'));
const PRESET = JSON.parse(fs.readFileSync(new URL('../data/preset.json', import.meta.url), 'utf8'));

const card = (id, skills, extra = {}) => ({
  id, name: id, active: true, left: null, status: null, evalStage: null, lastTalk: null,
  snapshot: null, items: [], followups: [], nextTalk: null, skills, ...extra,
});
const line = (g, id) => g.groups.find((x) => x.id === id);

// Cycle starts Tue 2026-09-01; today is Tue 2026-10-06, day 36 = week 6. Week ends: 09-07, 09-14,
// 09-21, 09-28, 10-05, then today.
const START = '2026-09-01';
const TODAY = '2026-10-06';
const noa = card('t-1', {
  'learn.independence': { a: [['2026-09-03', 2, 'agent'], ['2026-09-20', 4, 'agent']], n: 2 },
  'impl.debugging': { a: [['2026-09-10', 3, 'agent'], ['2026-09-25', 1, 'commander']], n: 3 },
});
const dani = card('t-2', { 'learn.independence': { a: [['2026-09-05', 4, 'agent']], n: 1 } });
const gone = card('t-3', { 'learn.independence': { a: [['2026-09-01', 1, 'agent']], n: 1 } }, { active: false, left: { date: '2026-09-20' } });
const CARDS = [noa, dani, gone];

test('growth replays the card\'s Assessments at each week\'s end: mean of rated Skills per Stage and overall', () => {
  const g = growth(noa, { cards: CARDS, skills: SKILLS, start: START, today: TODAY });
  assert.deepEqual(g.weeks.map((w) => [w.week, w.end]), [
    [1, '2026-09-07'], [2, '2026-09-14'], [3, '2026-09-21'], [4, '2026-09-28'], [5, '2026-10-05'], [6, '2026-10-06'],
  ]);
  assert.deepEqual(g.groups.map((x) => x.id), ['learn', 'problem', 'plan', 'impl', 'inter']);
  assert.deepEqual(line(g, 'learn').me, [2, 2, 4, 4, 4, 4]);
  // The Commander's 1 on 09-25 is the Rating from week 4 on.
  assert.deepEqual(line(g, 'impl').me, [null, 3, 3, 1, 1, 1]);
  assert.deepEqual(line(g, 'plan').me, [null, null, null, null, null, null]);
  assert.deepEqual(g.overall.me, [2, 2.5, 3.5, 2.5, 2.5, 2.5]);
  // Each Stage's chart title: this week's value and its change since the first rated week.
  assert.deepEqual([line(g, 'learn').now, line(g, 'learn').change], [4, 2]);
  assert.deepEqual([line(g, 'impl').now, line(g, 'impl').change], [1, -2]);
  assert.deepEqual([line(g, 'plan').now, line(g, 'plan').change], [null, null]);
});

test('the team line is the mean of active Trainees, this one included; Trainees who left don\'t count', () => {
  const g = growth(noa, { cards: CARDS, skills: SKILLS, start: START, today: TODAY });
  assert.deepEqual(line(g, 'learn').team, [3, 3, 4, 4, 4, 4]);
  assert.deepEqual(line(g, 'impl').team, [null, 3, 3, 1, 1, 1]);
  assert.deepEqual(g.overall.team, [3, 3.25, 3.75, 3.25, 3.25, 3.25]);
  // A Trainee who left is compared with the active team, without themself.
  assert.deepEqual(growth(gone, { cards: CARDS, skills: SKILLS, start: START, today: TODAY }).overall.team, [3, 3.25, 3.75, 3.25, 3.25, 3.25]);
});

test('the average tile: across all Skills today, its change vs 4 weeks ago, and the team average', () => {
  const g = growth(noa, { cards: CARDS, skills: SKILLS, start: START, today: TODAY });
  // Today: independence 4, debugging 1. 28 days ago (09-08): independence 2 only.
  assert.deepEqual(g.average, { now: 2.5, delta: 0.5, team: 3.25 });
  const fresh = growth(card('t-9', {}), { cards: CARDS, skills: SKILLS, start: START, today: TODAY });
  assert.deepEqual(fresh.average, { now: null, delta: null, team: 3.25 });
});

// Movers: today vs 28 days earlier (2026-10-02 vs 2026-09-04).
const MOVES_TODAY = '2026-10-02';
const mover = card('t-1', {
  'learn.independence': { a: [['2026-09-01', 2, 'agent'], ['2026-09-30', 4, 'agent']], n: 2 },
  'impl.debugging': { a: [['2026-09-02', 3, 'agent'], ['2026-09-28', 4, 'agent']], n: 2 },
  'inter.teamwork': { a: [['2026-09-01', 5, 'agent'], ['2026-10-01', 3, 'commander']], n: 2 },
  'plan.many-ideas': { a: [['2026-09-03', 2, 'agent'], ['2026-09-29', 1, 'agent']], n: 2 },
  'problem.requirement': { a: [['2026-09-02', 3, 'agent'], ['2026-10-01', 3, 'agent']], n: 2 },
  'learn.motivation': { a: [['2026-09-20', 4, 'agent']], n: 1 },
  'learn.diligence': { a: [['2026-09-05', 2, 'agent']], n: 1 }, // the day after the baseline: new
});

test('"מה זז ב-4 השבועות האחרונים": Skills whose Rating rose or fell vs 28 days ago, biggest rise first, biggest fall last', () => {
  const g = growth(mover, { cards: [mover], skills: SKILLS, start: START, today: MOVES_TODAY });
  assert.deepEqual(g.movers.map((m) => [m.id, m.delta, m.now]), [
    ['learn.independence', 2, 4],
    ['impl.debugging', 1, 4],
    ['plan.many-ideas', -1, 1],
    ['inter.teamwork', -2, 3],
  ]);
  assert.deepEqual(g.movers.map((m) => [m.name, m.group]), [
    ['עצמאות', 'למידה ותאוריה'], ['יכולות דיבאג', 'מימוש בקוד'], ['חשיבה על הרבה רעיונות', 'תכנון הקוד'], ['עבודת צוות', 'בין-אישי'],
  ]);
});

test('the rose/fell tile counts risers, fallers, the unchanged and the new ones without a baseline', () => {
  const g = growth(mover, { cards: [mover], skills: SKILLS, start: START, today: MOVES_TODAY });
  assert.deepEqual(g.moves, { rose: 2, fell: 2, flat: 1, fresh: 2 });
  assert.deepEqual(growth(card('t-9', {}), { cards: [], skills: SKILLS, start: START, today: MOVES_TODAY }).moves, { rose: 0, fell: 0, flat: 0, fresh: 0 });
});

test('the coverage tile: rated Skills of all Skills in use, the first week with a Rating, and how many are stale', () => {
  const total = SKILLS.groups.reduce((n, g) => n + g.skills.length, 0);
  const g = growth(mover, { cards: [mover], skills: SKILLS, start: START, today: MOVES_TODAY });
  assert.deepEqual(g.coverage, { rated: 7, total, firstWeek: 1, stale: 0 });
  const late = card('t-2', {
    'impl.debugging': { a: [['2026-09-16', 3, 'agent']], n: 1 },
    'inter.teamwork': { a: [['2026-08-01', 3, 'agent']], n: 1 }, // before the Cycle started, and stale
  });
  assert.deepEqual(growth(late, { cards: [late], skills: SKILLS, start: START, today: '2026-10-20' }).coverage, { rated: 2, total, firstWeek: 1, stale: 1 });
  const lateOnly = card('t-3', { 'impl.debugging': { a: [['2026-09-16', 3, 'agent']], n: 1 } });
  assert.equal(growth(lateOnly, { cards: [lateOnly], skills: SKILLS, start: START, today: '2026-10-20' }).coverage.firstWeek, 3);
  const skills = structuredClone(SKILLS);
  skills.groups[0].skills[0].archived = true; // learn.self-awareness, unrated: out of the count
  skills.groups[0].skills[3].archived = true; // learn.independence, rated: still counts
  assert.deepEqual(growth(mover, { cards: [mover], skills, start: START, today: MOVES_TODAY }).coverage, { rated: 7, total: total - 1, firstWeek: 1, stale: 0 });
  assert.deepEqual(growth(card('t-9', {}), { cards: [], skills: SKILLS, start: START, today: MOVES_TODAY }).coverage, { rated: 0, total, firstWeek: null, stale: 0 });
});

test('the side list groups Trainees by Status, those needing care first, reddest first within a group, those who left at the end', () => {
  const st = (value) => ({ value, by: 'agent', reason: 'x', at: '' });
  const cards = [
    card('t-1', {}, { name: 'נועה', status: st('good'), lastTalk: '2026-10-01' }),
    card('t-2', {}, { name: 'דני', status: st('concern'), lastTalk: '2026-09-20', evalStage: 'רף מקס' }),
    card('t-3', {}, { name: 'מאיה', status: st('good'), lastTalk: null }),
    card('t-4', {}, { name: 'אור', status: st('watch'), lastTalk: '2026-10-05' }),
    card('t-5', {}, { name: 'עידו', lastTalk: '2026-10-04' }),
    card('t-6', {}, { name: 'יואב', status: st('good'), active: false, left: { date: '2026-09-10' } }),
    card('t-7', {}, { name: 'אביב', active: false, left: { date: '2026-09-12' } }),
  ];
  const nav = fileNav(cards, { today: TODAY, talk: DEFAULT_TALK });
  assert.deepEqual(nav.map((g) => [g.key, g.label, g.items.map((i) => i.id)]), [
    ['concern', 'דורשים טיפול', ['t-2']],
    ['watch', 'במעקב', ['t-4']],
    ['good', 'במסלול', ['t-3', 't-1']],
    ['none', 'ללא סטטוס', ['t-5']],
    ['left', 'עזבו', ['t-7', 't-6']],
  ]);
  assert.deepEqual(nav[0].items[0], { id: 't-2', name: 'דני', evalStage: 'רף מקס', days: 16, color: talkColor(16, DEFAULT_TALK), left: false });
  assert.deepEqual(nav[4].items[1], { id: 't-6', name: 'יואב', evalStage: null, days: null, color: null, left: true });
  assert.deepEqual(fileNav([cards[0]], { today: TODAY, talk: DEFAULT_TALK }).map((g) => g.key), ['good']);
});

const ev = (id, kind, date, excerpt, extra = {}) => ({ id, kind, date, excerpt, at: `${date}T10:00:00+03:00`, retracted: false, ...extra });
const change = (id, type, at, extra = {}) => ({ id, type, at, by: 'agent', retracted: false, ...extra });

test('the timeline: live Evidence and Status changes, newest first, with each kind\'s label', () => {
  const evidence = [
    ev('e-1-1', 'talk', '2026-09-10', 'דיברנו על הדיבאג'),
    ev('e-2-1', 'test', '2026-09-20', 'קיבלה 85 בתרץ', { test: 'Goldstar', score: 85, self: 'היה קל' }),
    ev('e-3-1', 'project-observation', '2026-09-25', 'מובילה בצוות', { project: 'padens' }),
    ev('e-4-1', 'code-review', '2026-09-26', 'קוד מסודר', { test: 'Goldstar' }),
    ev('e-5-1', 'note', '2026-09-27', 'בוטל', { retracted: true }),
    ev('e-6-1', 'project-observation', '2026-09-28', 'עבדה לבד', { project: 'gone' }),
  ];
  const changes = [
    change('e-3-5', 'status', '2026-09-25T12:00:00+03:00', { from: null, to: 'good', reason: 'מתקדמת' }),
    change('c-1', 'status', '2026-09-30T09:00:00+03:00', { by: 'commander', from: 'good', to: 'watch', reason: 'שבוע בלי הגשות' }),
    change('e-3-6', 'snapshot', '2026-09-25T12:00:00+03:00', { text: 'תמונה' }),
    change('e-4-5', 'status', '2026-09-26T12:00:00+03:00', { from: 'good', to: 'concern', reason: 'בוטל', retracted: true }),
  ];
  const t = timeline(evidence, changes, { preset: PRESET });
  assert.deepEqual(t.entries.map((e) => [e.id, e.date, e.label]), [
    ['c-1', '2026-09-30', 'שינוי סטטוס'],
    ['e-6-1', '2026-09-28', 'תצפית פרויקט'],
    ['e-4-1', '2026-09-26', 'סקד'],
    ['e-3-5', '2026-09-25', 'שינוי סטטוס'],
    ['e-3-1', '2026-09-25', 'תצפית פרויקט'],
    ['e-2-1', '2026-09-20', 'תרץ'],
    ['e-1-1', '2026-09-10', 'שיחה'],
  ]);
  const by = Object.fromEntries(t.entries.map((e) => [e.id, e]));
  assert.deepEqual([by['c-1'].text, by['c-1'].from, by['c-1'].to, by['c-1'].by], ['שבוע בלי הגשות', 'במסלול', 'במעקב', 'commander']);
  assert.deepEqual([by['e-3-5'].from, by['e-3-5'].to, by['e-3-5'].by], [null, 'במסלול', 'agent']);
  assert.equal(by['e-2-1'].text, 'קיבלה 85 בתרץ');
  assert.equal(by['e-2-1'].detail, 'Goldstar · 85 · לדבריו/ה: היה קל');
  assert.equal(by['e-4-1'].detail, 'Goldstar');
  assert.equal(by['e-3-1'].detail, 'Padens');
  assert.equal(by['e-6-1'].detail, MARK);
  assert.equal(by['e-1-1'].detail, null);
});

test('the timeline filters by kind; the chips list the kinds present, with counts', () => {
  const evidence = [ev('e-1-1', 'talk', '2026-09-10', 'א'), ev('e-2-1', 'talk', '2026-09-12', 'ב'), ev('e-3-1', 'goal', '2026-09-13', 'ג')];
  const changes = [change('c-1', 'status', '2026-09-30T09:00:00+03:00', { by: 'commander', from: null, to: 'good', reason: 'x' })];
  const all = timeline(evidence, changes, { preset: PRESET });
  assert.deepEqual(all.kinds, [{ kind: 'talk', label: 'שיחה', count: 2 }, { kind: 'goal', label: 'שאיפות', count: 1 }, { kind: 'status', label: 'שינוי סטטוס', count: 1 }]);
  assert.deepEqual(timeline(evidence, changes, { preset: PRESET, kind: 'talk' }).entries.map((e) => e.id), ['e-2-1', 'e-1-1']);
  assert.deepEqual(timeline(evidence, changes, { preset: PRESET, kind: 'status' }).entries.map((e) => e.id), ['c-1']);
  // A kind no longer present (its Evidence was retracted) shows everything rather than nothing.
  assert.equal(timeline(evidence, changes, { preset: PRESET, kind: 'test' }).entries.length, 4);
  // Not loaded yet: unknown, not empty. Changes still loading: the Evidence shows meanwhile.
  assert.equal(timeline(null, changes, { preset: PRESET }), null);
  assert.deepEqual(timeline(evidence, null, { preset: PRESET }).entries.map((e) => e.id), ['e-3-1', 'e-2-1', 'e-1-1']);
});

const fileOf = (c, extra = {}) => traineeFile(c, {
  cards: CARDS, skills: SKILLS, preset: PRESET, cycle: { name: 'מחזור', start: START }, evidence: [], changes: [], today: TODAY, talk: DEFAULT_TALK, ...extra,
});

test('the file header: Status, evaluation tag, days-since-Talk chip in the circle\'s colour, Snapshot', () => {
  const f = fileOf({
    ...noa, name: 'נועה', lastTalk: '2026-10-01', evalStage: 'רף מקס',
    status: { value: 'concern', by: 'commander', reason: 'נכנסה לרף', at: '' },
    snapshot: { text: 'מתקדמת.', at: '2026-10-01T10:00:00+03:00' },
  });
  assert.deepEqual([f.name, f.days, f.color, f.evalStage, f.left], ['נועה', 5, talkColor(5, DEFAULT_TALK), 'רף מקס', null]);
  assert.deepEqual(f.status, { value: 'concern', label: 'דורש טיפול', by: 'commander', reason: 'נכנסה לרף' });
  assert.deepEqual(f.snapshot, { text: 'מתקדמת.', at: '2026-10-01T10:00:00+03:00' });
  assert.equal(f.start, START);
  assert.deepEqual(f.nav.map((g) => g.key), ['none', 'left']);
  // Someone who left: read-only, no chip.
  const g = fileOf({ ...gone, left: { date: '2026-09-20', how: 'transfer', reason: 'עבר מסלול' } });
  assert.deepEqual([g.days, g.color, g.left], [null, null, { date: '2026-09-20', how: 'transfer', reason: 'עבר מסלול' }]);
});

test('the file lists improve and keep items apart, and the open Follow-ups word-for-word', () => {
  const items = [
    { id: 'i-1', kind: 'improve', text: 'לתכנן על דף', by: 'commander', date: '2026-09-10' },
    { id: 'i-2', kind: 'keep', text: 'שואלת שאלות מדויקות', by: 'agent', date: '2026-09-11' },
    { id: 'i-3', kind: 'improve', text: MARK, by: 'agent', date: '2026-09-12' },
  ];
  const followups = [{ id: 'f-1', text: 'לבדוק את תרגיל הרקורסיה', date: '2026-09-20' }];
  const f = fileOf({ ...noa, items, followups });
  assert.deepEqual(f.items, {
    improve: [{ text: 'לתכנן על דף', by: 'commander' }, { text: MARK, by: 'agent' }],
    keep: [{ text: 'שואלת שאלות מדויקות', by: 'agent' }],
  });
  assert.deepEqual(f.followups, [{ text: 'לבדוק את תרגיל הרקורסיה', date: '2026-09-20' }]);
});

test('every Skill of each Stage, rated or not, with its Rating, its Assessment history and its Evidence count', () => {
  const f = fileOf(noa);
  assert.deepEqual(f.skills.map((g) => g.id), ['learn', 'problem', 'plan', 'impl', 'inter']);
  const learn = f.skills[0];
  assert.equal(learn.skills.length, SKILLS.groups[0].skills.length);
  assert.equal(learn.mean, 4);
  const ind = learn.skills.find((k) => k.id === 'learn.independence');
  assert.deepEqual([ind.name, ind.rating.score, ind.n], ['עצמאות', 4, 2]);
  assert.deepEqual(ind.history, [['2026-09-03', 2, 'agent'], ['2026-09-20', 4, 'agent']]);
  const none = learn.skills.find((k) => k.id === 'learn.depth');
  assert.deepEqual([none.rating, none.history, none.n], [null, [], 0]);
  assert.equal(f.skills[2].mean, null);
  // An archived Skill shows while rated; one the framework lacks shows as the marker.
  const skills = structuredClone(SKILLS);
  skills.groups[0].skills[0].archived = true;
  skills.groups[0].skills[3].archived = true;
  const odd = { ...noa, skills: { ...noa.skills, 'impl.c-zz99': { a: [['2026-10-01', 3, 'agent']], n: 1 } } };
  const g = fileOf(odd, { skills });
  assert.deepEqual(g.skills[0].skills.map((k) => k.id).slice(0, 3), ['learn.depth', 'learn.attention-to-detail', 'learn.independence']);
  assert.deepEqual(g.skills.at(-1).skills.map((k) => [k.name, k.rating.score]), [[MARK, 3]]);
});

test('the file\'s timeline and growth come from the same Trainee', () => {
  const f = fileOf(noa, { evidence: [ev('e-1-1', 'talk', '2026-09-10', 'דיברנו')], changes: null, kind: 'talk' });
  assert.deepEqual(f.timeline.entries.map((e) => e.id), ['e-1-1']);
  assert.deepEqual(f.growth.overall.me, [2, 2.5, 3.5, 2.5, 2.5, 2.5]);
  assert.equal(fileOf(noa, { evidence: null }).timeline, null);
});
