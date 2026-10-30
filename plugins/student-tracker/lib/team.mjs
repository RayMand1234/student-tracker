// Team status and proactive alerts (ticket 10's resolved rules), computed from the Trainee cards,
// the Commander's Talk settings and the Skill framework. Pure: the store reads and writes around it.
import { rating, daysSince, shiftDate, isActive } from '../dashboard/derive.mjs';

const SHARED_MIN = 3; // a weakness is shared when this many active Trainees have it
const WEAK = 2; // rated this or lower
const SHARED_LINES = 2;
const byName = (a, b) => a.name.localeCompare(b.name, 'he');

// {id: {name, archived}} for every Skill of the framework.
function skillIndex(framework) {
  return Object.fromEntries((framework?.groups ?? []).flatMap((g) => g.skills.map((s) => [s.id, s])));
}

// A Talk's level against the Commander's yellow / red thresholds, from the days since the last
// one: 'red', 'yellow', 'fine' (not due yet), or null when there has been none.
const FINE = 'fine';
function talkLevel(days, talk) {
  if (days === null) return null;
  return days >= talk.red ? 'red' : days >= talk.yellow ? 'yellow' : FINE;
}

// Skills rated WEAK or lower for SHARED_MIN or more active Trainees: most Trainees first, then the
// lowest mean, then Skill id. Archived Skills aside.
function sharedWeaknesses(cards, skills, today) {
  const by = {};
  for (const c of cards) {
    for (const [skill, entry] of Object.entries(c.skills ?? {})) {
      const r = rating(entry, today);
      if (!r || r.score > WEAK || !skills[skill] || skills[skill].archived) continue;
      (by[skill] ??= []).push({ id: c.id, name: c.name, score: r.score });
    }
  }
  const mean = (ts) => ts.reduce((s, t) => s + t.score, 0) / ts.length;
  return Object.entries(by)
    .filter(([, ts]) => ts.length >= SHARED_MIN)
    .map(([skill, ts]) => ({ skill, name: skills[skill].name, trainees: ts.sort((a, b) => a.score - b.score || byName(a, b)) }))
    .sort((a, b) => b.trainees.length - a.trainees.length || mean(a.trainees) - mean(b.trainees) || a.skill.localeCompare(b.skill));
}

// "מה המצב": the four lists of ticket 10, active Trainees only.
export function teamStatus({ cards, cycle, framework, talk, today }) {
  const active = cards.filter(isActive);
  const skills = skillIndex(framework);
  const monthAgo = shiftDate(today, -28);

  const needTalk = active
    .map((c) => {
      const days = daysSince(c.lastTalk, today);
      return { id: c.id, name: c.name, days, level: talkLevel(days, talk) };
    })
    .filter((t) => t.level !== FINE)
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || byName(a, b));

  const declining = active
    .map((c) => {
      const drops = Object.entries(c.skills ?? {}).flatMap(([skill, entry]) => {
        const r = rating(entry, today);
        if (r?.trend !== -1 || !skills[skill] || skills[skill].archived) return [];
        return [{ skill, name: skills[skill].name, from: rating(entry, monthAgo).score, to: r.score }];
      });
      return { id: c.id, name: c.name, drops, status: c.status?.value ?? null, evalStage: c.evalStage ?? null };
    })
    .filter((t) => t.drops.length || t.status === 'concern' || t.evalStage)
    .sort((a, b) => (b.status === 'concern') - (a.status === 'concern') || !!b.evalStage - !!a.evalStage
      || Math.max(0, ...b.drops.map((d) => d.from - d.to)) - Math.max(0, ...a.drops.map((d) => d.from - d.to))
      || byName(a, b));

  const shared = sharedWeaknesses(active, skills, today).slice(0, SHARED_LINES);
  const flagged = new Set([...needTalk, ...declining, ...shared.flatMap((w) => w.trainees)].map((t) => t.id));
  return {
    cycle: cycle?.name ?? null,
    week: cycle?.start ? Math.floor(daysSince(cycle.start, today) / 7) + 1 : null,
    active: active.length,
    needTalk,
    declining,
    shared,
    fine: active.filter((c) => !flagged.has(c.id)).sort(byName).map((c) => c.name),
  };
}

// The alerts due now, in ticket 10's priority: a red overdue Talk (most days first), a weakness
// newly shared by SHARED_MIN or more, a pattern the agent saw for the Trainee just written about,
// then a yellow overdue Talk. `shown`: {key: last day shown}. A Talk or pattern alert is shown at
// most once a day per Trainee (a pattern's theme, the agent's words, is never stored); a shared
// weakness once for each set of Trainees sharing it. A Trainee with no Talk yet counts from the
// Cycle's start.
export function dueAlerts({ cards, cycle, framework, talk, today, shown = {}, pattern }) {
  const active = cards.filter(isActive);
  const talks = active
    .map((c) => {
      const days = daysSince(c.lastTalk ?? cycle?.start ?? today, today);
      return { key: `talk:${c.id}`, kind: 'talk', level: talkLevel(days, talk), trainee: c.id, name: c.name, days, noTalk: !c.lastTalk };
    })
    .filter((a) => a.level !== FINE)
    .sort((a, b) => b.days - a.days || byName(a, b));
  const weak = sharedWeaknesses(active, skillIndex(framework), today).map((w) => ({
    key: weaknessKey(w),
    kind: 'weakness',
    skill: w.skill,
    name: w.name,
    trainees: w.trainees,
  }));
  const seen = pattern && active.find((c) => c.id === pattern.trainee);
  const repeated = seen ? [{ key: `pattern:${seen.id}`, kind: 'pattern', trainee: seen.id, name: seen.name, theme: pattern.theme.trim() }] : [];
  return [
    ...talks.filter((a) => a.level === 'red'),
    ...weak,
    ...repeated,
    ...talks.filter((a) => a.level === 'yellow'),
  ].filter((a) => (a.kind === 'weakness' ? !shown[a.key] : shown[a.key] !== today));
}

const weaknessKey = (w) => `weakness:${w.skill}:${w.trainees.map((t) => t.id).sort().join(',')}`;

// What the alert memory keeps: a weakness key while its Skill is still a shared weakness (each
// set of Trainees is shown once; once nobody shares it any more it is forgotten, so it is news if
// it comes back), the other keys for today only.
export function keepShown(shown, { cards, framework, today }) {
  const still = new Set(sharedWeaknesses(cards.filter(isActive), skillIndex(framework), today).map((w) => w.skill));
  return Object.fromEntries(Object.entries(shown).filter(([key, day]) => (key.startsWith('weakness:')
    ? still.has(key.split(':')[1])
    : day === today)));
}
