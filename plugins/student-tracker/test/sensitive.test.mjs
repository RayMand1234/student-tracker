// Sensitive details: kept apart from everything the dashboard page reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

const NOW = new Date('2026-10-30T09:15:00');
const MARK = '[פרט אישי — בתיק]';

function team() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-sens-'));
  const store = openStore({ dataDir, now: () => NOW });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees: ['נועה', 'דני'] });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id };
}

const OPEN = 'דיברתי היום עם נועה על הדיבאג.';
const FAMILY = 'אמא שלה בבית חולים והיא לא ישנה בלילות.';
const AGREED = 'סיכמנו שתשב עם דני על התרץ.';
const TEXT = `${OPEN} ${FAMILY} ${AGREED}`;
const PUBLIC = `${OPEN} ${MARK} ${AGREED}`;

// The Talk with the family sentence cut out into a sensitive Evidence.
const talk = (tid, more = {}) => ({
  trainee: tid,
  kind: 'talk',
  date: '2026-10-30',
  excerpt: PUBLIC,
  topics: ['דיבאג'],
  sensitive: [{ category: 'family', excerpt: FAMILY, ...more }],
});

// Everything the dashboard page may read for one Trainee: its card and its public subcollections.
function pageView(store, tid) {
  const { card, evidence, assessments, followups, items, changes } = store.readTrainee(tid);
  return JSON.stringify({ team: store.readTeam(), card, evidence, assessments, followups, items, changes, cycle: store.readCycle() });
}

test('a sensitive sentence becomes its own record in the sensitive collection; the public Evidence keeps the marker', () => {
  const { store, id } = team();
  const { entry, evidence, sensitive } = store.recordEntry({ text: TEXT, evidence: [talk(id['נועה'])] });

  assert.deepEqual(evidence, [`${entry}-1`]);
  assert.deepEqual(sensitive, [`${entry}-2`]);
  const noa = store.readTrainee(id['נועה']);
  assert.deepEqual(noa.evidence.map((e) => [e.id, e.kind, e.excerpt]), [[`${entry}-1`, 'talk', PUBLIC]]);
  assert.equal(noa.sensitive.length, 1);
  const [s] = noa.sensitive;
  assert.equal(s.id, `${entry}-2`);
  assert.equal(s.trainee, id['נועה']);
  assert.equal(s.record, 'evidence');
  assert.equal(s.kind, 'note');
  assert.equal(s.category, 'family');
  assert.equal(s.excerpt, FAMILY);
  assert.equal(s.in, `${entry}-1`);
  assert.equal(s.date, '2026-10-30');
  assert.equal(s.retracted, false);
  assert.equal(noa.card.lastTalk, '2026-10-30');
  assert.equal(noa.entries[0].text, TEXT, 'the raw Entry keeps the whole message');

  assert.ok(!pageView(store, id['נועה']).includes('בבית חולים'), 'no sensitive text where the page reads');
  assert.deepEqual(store.readTrainee(id['דני']).sensitive, []);
});

test('a Follow-up quoting a sensitive part is stored with it; the card shows only the marker, and a later Evidence closes it', () => {
  const { store, id } = team();
  const check = 'לבדוק שהיא הולכת לקב"ן.';
  const text = `דיברתי עם נועה. היא במצוקה גדולה בגלל המצב בבית. ${check}`;
  const { followups } = store.recordEntry({
    text,
    evidence: [{
      trainee: id['נועה'], kind: 'talk', date: '2026-10-30', excerpt: `דיברתי עם נועה. ${MARK}`,
      sensitive: [{ category: 'distress', excerpt: `היא במצוקה גדולה בגלל המצב בבית. ${check}`, followups: [check] }],
    }],
  });

  const noa = store.readTrainee(id['נועה']);
  assert.deepEqual(noa.followups, [], 'not in the public Follow-ups');
  const f = noa.sensitive.find((s) => s.record === 'followup');
  assert.deepEqual([f.id, f.text, f.trainee], [followups[0], check, id['נועה']]);
  assert.deepEqual(noa.card.followups, [{ id: followups[0], text: MARK, date: '2026-10-30' }]);
  assert.ok(!pageView(store, id['נועה']).includes('קב"ן'));

  const later = 'נועה הלכה לקב"ן אתמול, היא מרגישה יותר טוב';
  store.recordEntry({ text: later, evidence: [{ trainee: id['נועה'], kind: 'note', date: '2026-10-30', excerpt: later, closes: followups }] });
  assert.deepEqual(store.readTrainee(id['נועה']).card.followups, []);
});

test('a public text still holding the sensitive sentence is refused, as is a marker with nothing cut out', () => {
  const { store, id } = team();
  const noa = id['נועה'];
  const refused = (ev, re) => assert.throws(() => store.recordEntry({ text: TEXT, evidence: [ev] }), re);

  refused({ ...talk(noa), excerpt: TEXT }, /holds a sensitive part/);
  refused({ ...talk(noa), excerpt: OPEN }, /in its place/);
  refused({ ...talk(noa), sensitive: undefined }, /stands only where a sensitive part was cut out/);
  refused({ ...talk(noa), followups: [FAMILY] }, /holds a sensitive part/);
  refused(talk(noa, { category: 'gossip' }), /category/);
  refused(talk(noa, { excerpt: 'אמא שלה חולה' }), /word-for-word/);
  refused(talk(noa, { kind: 'talk' }), /sensitive part is one of/);
  refused({ ...talk(noa), excerpt: `${AGREED} ${MARK} ${OPEN}` }, /word-for-word/); // pieces keep the Entry's order
  assert.equal(store.readTrainee(noa).entries.length, 0, 'nothing written');
});

test('"זה לא רגיש" moves the sensitive part, and the Follow-ups it opened, into the Trainee\'s records under the same ids', () => {
  const { store, id } = team();
  const check = 'לבדוק איך אמא שלה.';
  const text = `${OPEN} ${FAMILY} ${check}`;
  const { sensitive: [sid], followups: [fid] } = store.recordEntry({
    text,
    evidence: [{ ...talk(id['נועה']), excerpt: `${OPEN} ${MARK}`, sensitive: [{ category: 'family', excerpt: `${FAMILY} ${check}`, followups: [check] }] }],
  });

  assert.deepEqual(store.flipSensitive(sid), { id: sid, now: 'public', moved: [sid, fid] });
  const noa = store.readTrainee(id['נועה']);
  assert.deepEqual(noa.sensitive, []);
  const flipped = noa.evidence.find((e) => e.id === sid);
  assert.deepEqual([flipped.kind, flipped.excerpt, flipped.trainee], ['note', `${FAMILY} ${check}`, id['נועה']]);
  assert.equal('category' in flipped || 'record' in flipped, false);
  assert.deepEqual(noa.followups.map((f) => [f.id, f.text, f.from]), [[fid, check, sid]]);
  assert.deepEqual(noa.card.followups, [{ id: fid, text: check, date: '2026-10-30' }]);
});

test('"זה רגיש" moves a whole public Evidence and its Follow-ups into the sensitive collection; its Talk still counts', () => {
  const { store, id } = team();
  const text = 'דיברתי עם דני, הוא סיפר שיש לו חובות. לבדוק שקיבל עזרה מת"ש.';
  const { evidence: [eid], followups: [fid] } = store.recordEntry({
    text,
    evidence: [{ trainee: id['דני'], kind: 'talk', date: '2026-10-29', excerpt: text, followups: ['לבדוק שקיבל עזרה מת"ש.'] }],
  });

  assert.throws(() => store.flipSensitive(eid), /category/, 'moving in needs a category');
  assert.deepEqual(store.flipSensitive(eid, { category: 'finances' }), { id: eid, now: 'sensitive', moved: [eid, fid] });
  const dani = store.readTrainee(id['דני']);
  assert.deepEqual([dani.evidence, dani.followups], [[], []]);
  assert.deepEqual(dani.sensitive.map((s) => [s.id, s.record, s.category ?? null]), [[eid, 'evidence', 'finances'], [fid, 'followup', null]]);
  assert.equal(dani.sensitive[0].kind, 'talk');
  assert.equal(dani.card.lastTalk, '2026-10-29', 'the date of a Talk is not sensitive');
  assert.deepEqual(dani.card.followups, [{ id: fid, text: MARK, date: '2026-10-29' }]);
  assert.ok(!pageView(store, id['דני']).includes('חובות'));

  store.flipSensitive(eid);
  assert.deepEqual(store.readTrainee(id['דני']).evidence.map((e) => [e.id, e.excerpt]), [[eid, text]]);
});

test('"זה רגיש" names the card texts that now repeat what became sensitive, so they can be rewritten', () => {
  const { store, id } = team();
  const dani = id['דני'];
  const text = 'דיברתי עם דני, הוא סיפר שיש לו חובות כבדים בבנק.';
  const { evidence: [eid] } = store.recordEntry({
    text,
    evidence: [{ trainee: dani, kind: 'talk', date: '2026-10-29', excerpt: text }],
    changes: [
      { trainee: dani, type: 'snapshot', text: 'יש לו חובות כבדים בבנק' },
      { trainee: dani, type: 'nextTalk', questions: ['מה תעשה עם חובות כבדים בבנק?', 'מה עם הפרויקט?'] },
    ],
  });
  const { repeats } = store.flipSensitive(eid, { category: 'finances' });
  assert.deepEqual(repeats, [
    { what: 'snapshot', text: 'יש לו חובות כבדים בבנק' },
    { what: 'nextTalk', text: 'מה תעשה עם חובות כבדים בבנק?' },
  ]);
  // Fresh questions go in; the old ones would be refused now.
  assert.throws(() => store.recordNextTalk(dani, ['מה תעשה עם חובות כבדים בבנק?', 'מה עם הפרויקט?']), /repeats a sensitive part/);
  store.recordNextTalk(dani, ['איך אתה מרגיש השבוע?', 'מה עם הפרויקט?']);
  assert.equal('repeats' in store.flipSensitive(eid), false, 'moving out repeats nothing');
});

test('flipSensitive takes an Evidence id; a Follow-up moves with its Evidence and an unknown id is refused', () => {
  const { store, id } = team();
  const { followups: [fid] } = store.recordEntry({
    text: TEXT,
    evidence: [{ ...talk(id['נועה']), followups: [AGREED] }],
  });
  assert.throws(() => store.flipSensitive(fid, { category: 'family' }), /Evidence it was opened from/);
  assert.throws(() => store.flipSensitive('e-20261030-0915-zz-9', { category: 'family' }), /no Evidence/);
});

test('the Commander can mark what fits no category as other; the agent cannot cut a part as other', () => {
  const { store, id } = team();
  const text = 'דני עזר לכולם בבאג של ה-DB';
  const { evidence: [eid] } = store.recordEntry({ text, evidence: [{ trainee: id['דני'], kind: 'note', date: '2026-10-30', excerpt: text }] });
  assert.equal(store.flipSensitive(eid, { category: 'other' }).now, 'sensitive');
  assert.equal(store.readTrainee(id['דני']).sensitive[0].category, 'other');
  assert.throws(() => store.recordEntry({ text: TEXT, evidence: [talk(id['נועה'], { category: 'other' })] }), /category/);
});

test('a public text quoting only part of a sensitive sentence is refused too', () => {
  const { store, id } = team();
  const refused = (ev) => assert.throws(() => store.recordEntry({ text: TEXT, evidence: [ev] }), /holds a sensitive part/);
  refused({ ...talk(id['נועה']), excerpt: `${OPEN} ${MARK} בבית חולים` });
  refused({ ...talk(id['נועה']), followups: ['לא ישנה בלילות'] });
  // Words that also stand outside the sensitive sentence are fine.
  store.recordEntry({ text: TEXT, evidence: [{ ...talk(id['נועה']), followups: ['סיכמנו'] }] });
});

test('a clarification may correct a sensitive Evidence, citing it by id', () => {
  const { store, id } = team();
  const { sensitive: [sid] } = store.recordEntry({ text: TEXT, evidence: [talk(id['נועה'])] });
  const fix = 'תיקון: זו סבתא שלה, לא אמא';
  store.recordEntry({
    text: fix,
    evidence: [{ trainee: id['נועה'], kind: 'clarification', date: '2026-10-30', excerpt: MARK, clarifies: sid, sensitive: [{ category: 'family', excerpt: fix }] }],
  });
  assert.equal(store.readTrainee(id['נועה']).evidence.find((e) => e.kind === 'clarification').clarifies, sid);
});

// A sensitive detail stored by an earlier Entry never reaches a text written later for the
// dashboard, whoever writes it and whichever operation stores it.
test('a detail stored as sensitive earlier is refused in every later display text; display-safe words still go in', () => {
  const { store, id } = team();
  const noa = id['נועה'];
  store.recordEntry({ text: TEXT, evidence: [talk(noa)] });
  const leak = 'מתקשה כי אמא שלה בבית חולים';
  const later = 'נועה הגישה את התרגיל בזמן.';
  const entry = (extra, ev = {}) => ({ text: later, evidence: [{ trainee: noa, kind: 'note', date: '2026-10-30', excerpt: later, ...ev }], ...extra });
  const before = pageView(store, noa);
  const refused = (write) => assert.throws(write, /repeats a sensitive part/);

  refused(() => store.recordEntry(entry({ changes: [{ trainee: noa, type: 'snapshot', text: leak }] })));
  refused(() => store.recordEntry(entry({ changes: [{ trainee: noa, type: 'status', to: 'watch', reason: leak, evidence: ['#1'] }] })));
  refused(() => store.recordEntry(entry({ items: [{ trainee: noa, kind: 'improve', text: leak, by: 'agent', from: '#1' }] })));
  refused(() => store.recordEntry(entry({ assessments: [{ trainee: noa, skill: 'learn.self-awareness', score: 3, author: 'agent', reason: leak, evidence: ['#1'] }] })));
  refused(() => store.recordEntry(entry({}, { kind: 'talk', topics: ['אמא שלה בבית חולים'] })));
  const [eid] = store.readTrainee(noa).evidence.map((e) => e.id);
  refused(() => store.recordAssessments(noa, [{ skill: 'learn.self-awareness', score: 3, author: 'agent', reason: leak, evidence: [eid] }]));
  refused(() => store.updateTrainee(noa, { status: { to: 'watch', reason: leak } }));
  refused(() => store.updateTrainee(noa, { leave: { date: '2026-10-30', how: 'other', reason: leak } }));
  assert.equal(pageView(store, noa), before, 'nothing written');

  // Display-safe words go in, and so do words the Commander wrote in a public part of this Entry.
  store.recordEntry(entry({ changes: [{ trainee: noa, type: 'snapshot', text: 'מגישה בזמן; מצב אישי מורכב.' }] }));
  const open = 'נועה אמרה בקבוצה שאמא שלה בבית חולים, וכולם עזרו לה.';
  store.recordEntry({
    text: open,
    evidence: [{ trainee: noa, kind: 'note', date: '2026-10-30', excerpt: open }],
    changes: [{ trainee: noa, type: 'snapshot', text: 'שיתפה בקבוצה שאמא שלה בבית חולים' }],
  });
  const snapshots = store.readTrainee(noa).changes.filter((c) => c.type === 'snapshot').map((c) => c.text).sort();
  assert.deepEqual(snapshots, ['מגישה בזמן; מצב אישי מורכב.', 'שיתפה בקבוצה שאמא שלה בבית חולים'].sort());
  // Another Trainee's sensitive record is not this Trainee's to keep out.
  store.updateTrainee(id['דני'], { status: { to: 'watch', reason: 'אמא שלה בבית חולים, לא שלו' } });
});
