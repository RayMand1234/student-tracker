import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';
import { talkCircles } from '../dashboard/derive.mjs';

const NOW = new Date('2026-10-30T09:15:00');

function setUp(trainees = ['נועה', 'דני']) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-data-'));
  // A clock that moves a second per call, so records written one after another are ordered.
  let tick = 0;
  const store = openStore({ dataDir, now: () => new Date(NOW.getTime() + 1000 * tick++) });
  store.createCycle({ commander: { name: 'רז' }, cycle: { name: 'הצהובים' }, trainees });
  const id = Object.fromEntries(store.readTeam().map((t) => [t.name, t.id]));
  return { store, id, dataDir };
}

test('updateSettings changes the Talk target and thresholds, keeping what it was not given', () => {
  const { store } = setUp();
  const settings = store.updateSettings({ talk: { target: 7, yellow: 8 } });
  assert.deepEqual(settings.talk, { target: 7, yellow: 8, red: 14 });
  assert.equal(settings.name, 'רז');
  assert.deepEqual(store.readCycle().commander.settings.talk, { target: 7, yellow: 8, red: 14 });
});

test('updateSettings changes the Commander name and role', () => {
  const { store } = setUp();
  store.updateSettings({ name: 'רז כהן', role: 'מפ"צ' });
  const { settings } = store.readCycle().commander;
  assert.equal(settings.name, 'רז כהן');
  assert.equal(settings.role, 'מפ"צ');
});

test('updateSettings refuses thresholds that make no sense and unknown settings, changing nothing', () => {
  const { store } = setUp();
  assert.throws(() => store.updateSettings({ talk: { yellow: 14 } }), /yellow.*before red/);
  assert.throws(() => store.updateSettings({ talk: { target: 0 } }), /whole number of days/);
  assert.throws(() => store.updateSettings({ talk: { target: 12 } }), /target \(12\) cannot be past the yellow threshold \(10\)/);
  assert.throws(() => store.updateSettings({ talk: { target: 2.5 } }), /whole number of days/);
  assert.throws(() => store.updateSettings({ name: ' ' }), /name/);
  assert.throws(() => store.updateSettings({ colour: 'red' }), /unknown setting "colour"/);
  assert.throws(() => store.updateSettings({}), /nothing to change/);
  assert.deepEqual(store.readCycle().commander.settings.talk, { target: 10, yellow: 10, red: 14 });
});

test('new Talk thresholds move the dashboard circle colours', () => {
  const { store, id } = setUp();
  store.recordEntry({ text: 'דיברתי עם נועה', evidence: [{ trainee: id['נועה'], kind: 'talk', date: '2026-10-21', excerpt: 'דיברתי עם נועה' }] });
  const colourOfNoa = () => {
    const { commander } = store.readCycle();
    return talkCircles(store.readTeam(), commander.settings.talk, '2026-10-30').circles.find((c) => c.name === 'נועה').color.bg;
  };
  const before = colourOfNoa();
  store.updateSettings({ talk: { target: 5, yellow: 7 } });
  assert.notEqual(colourOfNoa(), before);
});

test('updateTrainee adds a Trainee: a t-<rand6> id, an added change record, an active card with no Talk', () => {
  const { store } = setUp();
  const card = store.updateTrainee(null, { add: { name: 'מאיה' } });
  assert.match(card.id, /^t-[a-z0-9]{6}$/);
  assert.equal(card.name, 'מאיה');
  assert.equal(card.active, true);
  assert.equal(card.lastTalk, null);
  assert.deepEqual(store.readTeam().map((t) => t.name).sort(), ['דני', 'מאיה', 'נועה']);
  const { changes } = store.readTrainee(card.id);
  assert.deepEqual(changes.map((c) => [c.type, c.name, c.by]), [['added', 'מאיה', 'commander']]);
  assert.deepEqual(store.rebuildCard(card.id), card, 'the card rebuilds from its records');
});

test('a second Noa needs a label: the bare name is refused, the namesake is relabelled and the new one added with hers', () => {
  const { store, id } = setUp();
  assert.throws(() => store.updateTrainee(null, { add: { name: 'נועה' } }), /already a Trainee named "נועה".*label/);
  store.updateTrainee(id['נועה'], { rename: { name: 'נועה כ.' } });
  const added = store.updateTrainee(null, { add: { name: 'נועה ל.' } });
  assert.deepEqual(store.readTeam().map((t) => t.name).sort(), ['דני', 'נועה כ.', 'נועה ל.']);
  assert.equal(store.readTrainee(id['נועה']).card.name, 'נועה כ.');
  assert.deepEqual(store.readTrainee(id['נועה']).changes.map((c) => c.type), ['added', 'renamed']);
  assert.deepEqual(store.rebuildCard(id['נועה']).name, 'נועה כ.');
  assert.throws(() => store.updateTrainee(added.id, { rename: { name: 'דני' } }), /already a Trainee named "דני"/);
});

test('a bare first name clashes with a labelled namesake both ways, ignoring spacing', () => {
  const { store, id } = setUp();
  assert.throws(() => store.updateTrainee(null, { add: { name: 'נועה ל.' } }), /"נועה" shares the first name.*label/);
  store.updateTrainee(id['נועה'], { rename: { name: 'נועה כ.' } });
  assert.throws(() => store.updateTrainee(null, { add: { name: 'נועה' } }), /shares the first name/);
  assert.throws(() => store.updateTrainee(null, { add: { name: 'נועה  כ.' } }), /already a Trainee named "נועה כ."/);
  store.updateTrainee(null, { add: { name: 'נועה ל.' } });
});

test('updateTrainee refuses an unknown Trainee, an empty name and an unknown change', () => {
  const { store, id } = setUp();
  assert.throws(() => store.updateTrainee('t-nobody', { rename: { name: 'x' } }), /unknown Trainee t-nobody/);
  assert.throws(() => store.updateTrainee(null, { add: { name: '  ' } }), /name/);
  assert.throws(() => store.updateTrainee(id['דני'], { promote: {} }), /one of add, rename, leave, rejoin/);
  assert.throws(() => store.updateTrainee(id['דני'], { add: { name: 'x' } }), /adding takes no Trainee id/);
});

const talkWith = (tid, text = 'דיברתי עם דני') => ({ text, evidence: [{ trainee: tid, kind: 'talk', date: '2026-10-30', excerpt: text }] });

test('a Trainee who left: card inactive with date, how and reason; out of the Talk circles; records kept', () => {
  const { store, id } = setUp();
  store.recordEntry(talkWith(id['דני']));
  const card = store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' } });
  assert.equal(card.active, false);
  assert.deepEqual(card.left, { date: '2026-10-29', how: 'transfer', reason: 'עבר לקורס אחר' });
  assert.equal(card.lastTalk, '2026-10-30');
  const { circles, left } = talkCircles(store.readTeam(), store.readCycle().commander.settings.talk, '2026-10-30');
  assert.deepEqual(circles.map((c) => c.name), ['נועה']);
  assert.deepEqual(left, ['דני']);
  const dani = store.readTrainee(id['דני']);
  assert.equal(dani.evidence.length, 1);
  assert.deepEqual(dani.changes.map((c) => c.type), ['added', 'left']);
  assert.deepEqual(store.rebuildCard(id['דני']), card);
});

test('leaving needs a date, a reason and one of dismissal, transfer, other; a Trainee leaves once', () => {
  const { store, id } = setUp();
  assert.throws(() => store.updateTrainee(id['דני'], { leave: { how: 'other', reason: 'x' } }), /date must be YYYY-MM-DD/);
  assert.throws(() => store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'fired', reason: 'x' } }), /dismissal, transfer, other/);
  assert.throws(() => store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'other' } }), /reason/);
  assert.throws(() => store.updateTrainee(id['דני'], { leave: { date: '2026-11-02', how: 'other', reason: 'x' } }), /in the future/);
  store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'other', reason: 'x' } });
  assert.throws(() => store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'other', reason: 'x' } }), /already left/);
  assert.throws(() => store.updateTrainee(id['נועה'], { rejoin: {} }), /has not left/);
});

test('a Trainee who left refuses new Evidence and Assessments unless the Commander insists', () => {
  const { store, id } = setUp();
  const { evidence: [talk] } = store.recordEntry(talkWith(id['דני']));
  store.updateTrainee(id['דני'], { leave: { date: '2026-10-30', how: 'dismissal', reason: 'הדחה' } });
  assert.throws(() => store.recordEntry(talkWith(id['דני'], 'שוב דיברתי עם דני')), /דני left on 2026-10-30.*insist/);
  const rate = [{ skill: 'impl.debugging', score: 3, author: 'commander', reason: 'x', evidence: [talk] }];
  assert.throws(() => store.recordAssessments(id['דני'], rate), /left on 2026-10-30/);
  assert.equal(store.readTrainee(id['דני']).evidence.length, 1);

  store.recordEntry({ ...talkWith(id['דני'], 'שוב דיברתי עם דני'), insist: true });
  store.recordAssessments(id['דני'], rate, { insist: true });
  assert.equal(store.readTrainee(id['דני']).evidence.length, 2);
  assert.equal(store.readTrainee(id['דני']).card.active, false, 'insisting does not bring them back');
});

test('rejoining makes a Trainee who left active again', () => {
  const { store, id } = setUp();
  store.updateTrainee(id['דני'], { leave: { date: '2026-10-29', how: 'other', reason: 'x' } });
  const card = store.updateTrainee(id['דני'], { rejoin: {} });
  assert.equal(card.active, true);
  assert.equal(card.left, null);
  store.recordEntry(talkWith(id['דני']));
  assert.deepEqual(store.rebuildCard(id['דני']).active, true);
});

const skillsOfGroup = (store, group) => store.readCycle().skills.groups.find((g) => g.id === group).skills;

test('a Skill added to a Stage gets a stable id in that Stage and can be assessed', () => {
  const { store, id } = setUp();
  const { skill } = store.updateCycle({ addSkill: { group: 'impl', name: 'ניהול זמן' } });
  assert.match(skill.id, /^impl\.c-[a-z0-9]{4}$/);
  assert.equal(skill.name, 'ניהול זמן');
  assert.ok(skillsOfGroup(store, 'impl').some((s) => s.id === skill.id && s.added));
  const { evidence: [talk] } = store.recordEntry(talkWith(id['דני']));
  store.recordAssessments(id['דני'], [{ skill: skill.id, score: 3, author: 'agent', reason: 'x', evidence: [talk] }]);
  assert.deepEqual(store.readTrainee(id['דני']).card.skills[skill.id].a, [['2026-10-30', 3, 'agent']]);
});

test('a Skill added to the Interpersonal group; a name already in that group is refused', () => {
  const { store } = setUp();
  store.updateCycle({ addSkill: { group: 'inter', name: 'הומור' } });
  assert.throws(() => store.updateCycle({ addSkill: { group: 'inter', name: 'הומור' } }), /already a Skill "הומור"/);
  assert.throws(() => store.updateCycle({ addSkill: { group: 'inter', name: 'עבודת צוות' } }), /already a Skill/);
  assert.throws(() => store.updateCycle({ addSkill: { group: 'inter', name: ' הומור ' } }), /already a Skill/);
  assert.throws(() => store.updateCycle({ addSkill: { group: 'zoo', name: 'x' } }), /unknown Stage or group "zoo"/);
  // The same name in another Stage is another Skill.
  store.updateCycle({ addSkill: { group: 'learn', name: 'הומור' } });
});

test('an archived Skill keeps its Assessments on the card but takes no new ones; restoring brings it back', () => {
  const { store, id } = setUp();
  const { evidence: [talk] } = store.recordEntry(talkWith(id['דני']));
  const rate = (score) => store.recordAssessments(id['דני'], [{ skill: 'impl.web-search', score, author: 'agent', reason: 'x', evidence: [talk] }]);
  rate(2);
  store.updateCycle({ archiveSkill: { skill: 'impl.web-search' } });
  const archived = skillsOfGroup(store, 'impl').find((s) => s.id === 'impl.web-search');
  assert.equal(archived.archived, true, 'archived, never deleted');
  assert.deepEqual(store.rebuildCard(id['דני']).skills['impl.web-search'].a, [['2026-10-30', 2, 'agent']]);
  assert.throws(() => rate(3), /impl.web-search is archived; restore it/);
  assert.throws(() => store.updateCycle({ archiveSkill: { skill: 'impl.web-search' } }), /already archived/);

  store.updateCycle({ restoreSkill: { skill: 'impl.web-search' } });
  rate(3);
  assert.equal(skillsOfGroup(store, 'impl').find((s) => s.id === 'impl.web-search').archived, undefined);
  assert.throws(() => store.updateCycle({ restoreSkill: { skill: 'impl.debugging' } }), /not archived/);
  assert.throws(() => store.updateCycle({ archiveSkill: { skill: 'impl.nothing' } }), /unknown Skill "impl.nothing"/);
});

const presetOf = (store) => store.readCycle().preset;

test('editTest renames a Test (the old name stays an alias), renumbers it and adds aliases', () => {
  const { store } = setUp();
  store.updateCycle({ editTest: { test: 'פוב', name: 'FOV2', number: '6', aliases: ['פוב2'] } });
  const fov = presetOf(store).tests.find((t) => t.id === 'tabi.fov');
  assert.deepEqual([fov.name, fov.number, fov.aliases], ['FOV2', '6', ['פוב', 'FOV', 'פוב2']]);
  assert.throws(() => store.updateCycle({ editTest: { test: 'FOV2', aliases: ['פליים'] } }), /"פליים" is already the Test "Flame"/);
  assert.throws(() => store.updateCycle({ editTest: { test: 'nothing', number: '1' } }), /no Test "nothing"/);
  assert.throws(() => store.updateCycle({ editTest: { test: 'FOV2' } }), /nothing to change/);
});

test('removeTest takes a Test out of this Cycle\'s catalog only', () => {
  const { store } = setUp();
  store.updateCycle({ removeTest: { test: 'אטום' } });
  assert.equal(presetOf(store).tests.some((t) => t.name === 'Atom'), false);
  assert.throws(() => store.updateCycle({ removeTest: { test: 'Atom' } }), /no Test "Atom"/);
  const shipped = JSON.parse(fs.readFileSync(new URL('../data/preset.json', import.meta.url), 'utf8'));
  assert.ok(shipped.tests.some((t) => t.name === 'Atom'), 'the shipped preset is untouched');
});

test('addProject adds a Project under a Subject; setWeek replaces one week of the Schedule', () => {
  const { store } = setUp();
  const preset = store.updateCycle({ addProject: { name: 'Chess', subject: 'oop', aliases: ['שחמט'] } });
  assert.deepEqual(preset.projects.at(-1), { id: 'chess', subject: 'oop', name: 'Chess', aliases: ['שחמט'] });
  assert.throws(() => store.updateCycle({ addProject: { name: 'שחמט', subject: 'oop' } }), /already the Project "Chess"/);
  assert.throws(() => store.updateCycle({ addProject: { name: 'X', subject: 'zoo' } }), /unknown Subject "zoo"/);

  store.updateCycle({ setWeek: { week: 6, subjects: ['oop'], projects: ['chess'] } });
  assert.deepEqual(presetOf(store).schedule.find((w) => w.week === 6), { week: 6, subjects: ['oop'], projects: ['chess'] });
  assert.equal(presetOf(store).schedule.length, 21);
  assert.throws(() => store.updateCycle({ setWeek: { week: 0, subjects: ['oop'] } }), /week/);
  assert.throws(() => store.updateCycle({ setWeek: { week: 7, subjects: ['zoo'] } }), /unknown Subject "zoo"/);
  assert.throws(() => store.updateCycle({ setWeek: { week: 7, subjects: ['oop'], projects: ['zoo'] } }), /unknown project "zoo"/);
});

test('removeProject takes a Project, by name or alias, out of the catalog and the Schedule; one with a team stays', () => {
  const { store, id } = setUp();
  const preset = store.updateCycle({ removeProject: { project: 'מז' } });
  assert.equal(preset.projects.some((p) => p.id === 'mz'), false);
  assert.equal(preset.schedule.some((w) => w.projects?.includes('mz')), false);
  assert.ok(preset.schedule.every((w) => !w.projects || w.projects.length), 'a week left with no Project drops the list');
  assert.throws(() => store.updateCycle({ removeProject: { project: 'MZ' } }), /no Project "MZ"/);

  store.updateCycle({ setTeam: { project: 'padens', name: 'בנק א', members: [id['נועה']] } });
  assert.throws(() => store.updateCycle({ removeProject: { project: 'Padens' } }), /team "בנק א"/);
});

test('removeWeek drops one week of the Schedule, so a shorter course ends earlier', () => {
  const { store } = setUp();
  const preset = store.updateCycle({ removeWeek: { week: 21 } });
  assert.equal(preset.schedule.length, 20);
  assert.equal(preset.schedule.at(-1).week, 20);
  assert.throws(() => store.updateCycle({ removeWeek: { week: 21 } }), /no week 21/);
  assert.throws(() => store.updateCycle({ removeWeek: { week: 5 } }), /only the last week/);
});

test('a Project team is stored in teams, and a project observation of a member links to it', () => {
  const { store, id } = setUp(['נועה', 'דני', 'מאיה']);
  const team = store.updateCycle({ setTeam: { project: 'padens', name: 'בנק א', members: [id['נועה'], id['דני']] } });
  assert.match(team.id, /^tm-[a-z0-9]{4}$/);
  assert.deepEqual(store.readCycle().teams, [{ id: team.id, project: 'padens', name: 'בנק א', members: [id['נועה'], id['דני']], at: team.at }]);

  const text = 'בפאדנס נועה חילקה את המשימות. מאיה עבדה לבד.';
  const { evidence } = store.recordEntry({
    text,
    evidence: [
      { trainee: id['נועה'], kind: 'project-observation', date: '2026-10-30', project: 'padens', excerpt: 'בפאדנס נועה חילקה את המשימות.' },
      { trainee: id['מאיה'], kind: 'project-observation', date: '2026-10-30', project: 'padens', excerpt: 'מאיה עבדה לבד.' },
    ],
  });
  assert.equal(store.readTrainee(id['נועה']).evidence.find((e) => e.id === evidence[0]).team, team.id);
  assert.equal(store.readTrainee(id['מאיה']).evidence.find((e) => e.id === evidence[1]).team, null, 'no team for her in that Project');
});

test('setTeam with an id replaces that team; a Trainee is in one team per Project; members and Project must exist', () => {
  const { store, id } = setUp(['נועה', 'דני', 'מאיה']);
  const team = store.updateCycle({ setTeam: { project: 'padens', name: 'בנק א', members: [id['נועה'], id['דני']] } });
  assert.throws(() => store.updateCycle({ setTeam: { project: 'padens', name: 'בנק ב', members: [id['דני'], id['מאיה']] } }), /דני is already in "בנק א"/);
  store.updateCycle({ setTeam: { project: 'mz', name: 'מז 1', members: [id['דני'], id['מאיה']] } });

  const moved = store.updateCycle({ setTeam: { id: team.id, project: 'padens', name: 'בנק א', members: [id['נועה'], id['מאיה']] } });
  assert.equal(moved.id, team.id);
  assert.deepEqual(store.readCycle().teams.find((t) => t.id === team.id).members, [id['נועה'], id['מאיה']]);
  assert.equal(store.readCycle().teams.length, 2);

  assert.throws(() => store.updateCycle({ setTeam: { project: 'zoo', name: 'x', members: [id['נועה']] } }), /unknown project "zoo"/);
  assert.throws(() => store.updateCycle({ setTeam: { project: 'interpreter', name: 'x', members: ['t-nobody'] } }), /unknown Trainee t-nobody/);
  assert.throws(() => store.updateCycle({ setTeam: { project: 'interpreter', name: 'x', members: [] } }), /at least one member/);
  assert.throws(() => store.updateCycle({ setTeam: { id: 'tm-none', project: 'interpreter', name: 'x', members: [id['נועה']] } }), /no team tm-none/);
});
