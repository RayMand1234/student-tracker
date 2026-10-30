// Pure derivation module of the dashboard page: every view computes from these, nothing else.
// No imports and only `export function` / `export const`, so the build can inline it in the page.

// Talk circle colour, anchored on the Commander's Talk settings `talk` = {target, yellow} (ticket 08): green at 0 days, lime at
// the target, amber at the yellow threshold, red at yellow + 7, deep red from yellow + 14.
// [day, hue, saturation %, lightness %]
export function talkStops({ target, yellow }) {
  const stops = [[0, 140, 55, 38]];
  if (target > 0 && target < yellow) stops.push([target, 78, 62, 42]); // lime only if it comes first
  stops.push([yellow, 38, 88, 48], [yellow + 7, 6, 72, 46], [yellow + 14, 355, 70, 30]);
  return stops;
}

// `days` null = no Talk yet = the deepest red.
export function talkColor(days, talk) {
  const stops = talkStops(talk);
  const last = stops.at(-1)[0];
  const x = days === null ? last : Math.min(Math.max(days, 0), last);
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const [a, b] = [stops[i], stops[i + 1]];
  const f = (x - a[0]) / (b[0] - a[0]);
  // Red (6) to deep red (355) goes down through 0, not back through green.
  const hb = b[1] - a[1] > 180 ? b[1] - 360 : b[1];
  const h = (Math.round(a[1] + (hb - a[1]) * f) + 360) % 360;
  const s = Math.round(a[2] + (b[2] - a[2]) * f);
  const l = Math.round(a[3] + (b[3] - a[3]) * f);
  return { bg: `hsl(${h} ${s}% ${l}%)`, ink: inkOn(h, s, l) };
}

// White or black text, whichever contrasts more with the circle (WCAG 2 luminance).
// Pure black: near-black misses 4.5:1 on the orange around yellow + 5.
function inkOn(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const bg = lum(channel(0), channel(8), channel(4));
  return 1.05 / (bg + 0.05) >= (bg + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

// Whole calendar days between two YYYY-MM-DD dates (never negative). null when no Talk yet.
export function daysSince(date, today) {
  if (!date) return null;
  const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.max(0, Math.round((utc(today) - utc(date)) / 86_400_000));
}

// Main page: one circle per active Trainee, reddest first (no Talk yet first of all, then most
// days, then by name); Trainees who left only by name.
export function talkCircles(cards, talk, today) {
  const isActive = (c) => c.active !== false && !c.left;
  const circles = cards.filter(isActive).map((c) => {
    const days = daysSince(c.lastTalk, today);
    return { id: c.id, name: c.name, days, evalStage: c.evalStage ?? null, color: talkColor(days, talk) };
  });
  circles.sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || a.name.localeCompare(b.name, 'he'));
  const left = cards.filter((c) => !isActive(c)).map((c) => c.name);
  return { circles, left };
}

// The colour bar under the title: 0 → deep red, a tick at each distinct anchor.
export function talkScale(talk) {
  const stops = talkStops(talk);
  const max = stops.at(-1)[0];
  const gradient = Array.from({ length: 11 }, (_, i) => talkColor((i / 10) * max, talk).bg);
  return { max, ticks: stops.map((s) => s[0]), gradient };
}

// A Skill's Rating on `today`, from its card entry `skill` = {a: [[date, score, author], …], n}
// (the counting Assessments, oldest first) — the rule of ticket 05, as the agent applies it:
// the latest Commander Assessment if there is one, else the latest agent one; null = unrated.
// Trend = sign of now − 28 days earlier (null when unrated then); stale = older than 42 days.
export function rating(skill, today) {
  const now = ratingAt(skill?.a ?? [], today);
  if (!now) return null;
  const then = ratingAt(skill.a, shiftDate(today, -28));
  return {
    ...now,
    trend: then ? Math.sign(now.score - then.score) : null,
    stale: daysSince(now.date, today) > 42,
    n: skill.n,
  };
}

// The Rating as of the end of `day`: on equal dates the later in the list (written last) wins.
function ratingAt(list, day) {
  const known = list.filter(([date, , author]) => date <= day && author !== 'trainee');
  const commander = known.filter(([, , author]) => author === 'commander');
  const pick = (commander.length ? commander : known).at(-1);
  return pick ? { date: pick[0], score: pick[1], author: pick[2] } : null;
}

function shiftDate(day, days) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

// What stands in a public text where a sensitive sentence was cut out; also shown for any id
// the page can't resolve (it never reads the sensitive records).
export const MARK = '[פרט אישי — בתיק]';

export const STATUS_LABELS = { good: 'במסלול', watch: 'במעקב', concern: 'דורש טיפול' };

// The Talk settings a Cycle starts with, until the Commander changes them.
export const DEFAULT_TALK = { target: 10, yellow: 10, red: 14 };

// The Trainee window (ticket 08): everything it shows, from the card plus `skills` (meta/skills),
// `preset` (meta/preset, for Project names), `teams` and the Trainee's public `evidence`
// (null while it loads). `groups` are the four Stages, then the Interpersonal group.
export function traineeWindow(card, { skills, preset, teams = [], evidence, today, talk }) {
  const days = daysSince(card.lastTalk, today);
  const groups = [...(skills?.groups ?? [])].sort((a, b) => a.order - b.order);
  const rated = (ids) => ids
    .map((id) => ({ id, rating: rating(card.skills?.[id], today) }))
    .filter((k) => k.rating);
  const shown = groups.map((g) => {
    const names = Object.fromEntries(g.skills.map((k) => [k.id, k.name]));
    const these = rated(g.skills.map((k) => k.id)).map((k) => ({ ...k, name: names[k.id] }));
    const ids = new Set(these.map((k) => k.id));
    return { id: g.id, name: g.name, rated: these, unrated: g.skills.filter((k) => !k.archived && !ids.has(k.id)).length };
  });
  // A rated Skill the framework doesn't name can't be resolved: shown, as the marker.
  const known = new Set(groups.flatMap((g) => g.skills.map((k) => k.id)));
  const unknown = rated(Object.keys(card.skills ?? {}).filter((id) => !known.has(id))).map((k) => ({ ...k, name: MARK }));
  if (unknown.length) shown.push({ id: null, name: MARK, rated: unknown, unrated: 0 });
  const project = (id) => preset?.projects?.find((p) => p.id === id)?.name ?? MARK;
  const live = evidence ? evidence.filter((e) => e.retracted === false) : null;
  const latest = (kind) => (live ? live.filter((e) => e.kind === kind).sort(byDayDesc)[0]?.excerpt ?? null : null);
  return {
    id: card.id,
    name: card.name,
    color: talkColor(days, talk),
    days,
    evalStage: card.evalStage ?? null,
    snapshot: card.snapshot ?? null,
    status: statusOf(card),
    groups: shown,
    details: {
      lastTalk: card.lastTalk ? { date: card.lastTalk, days } : null,
      teams: teams.filter((t) => (t.members ?? []).includes(card.id))
        .map((t) => `${project(t.project)} · ${t.name}`)
        .sort((a, b) => a.localeCompare(b, 'he')),
      goal: latest('goal'),
      background: latest('background'),
      evidence: live ? { count: live.length, last: [...live].sort(byDayDesc)[0]?.date ?? null } : null,
    },
    next: [
      ...(card.followups ?? []).map((f) => ({ kind: 'followup', text: f.text, date: f.date })),
      ...(card.nextTalk?.questions ?? []).map((q) => ({ kind: 'question', text: q })),
    ],
  };
}

const statusOf = ({ status: s }) => (s ? { value: s.value, label: STATUS_LABELS[s.value] ?? s.value, by: s.by, reason: s.reason } : null);

// The Trainee file (ticket 08, level 3): everything it shows, from the card plus every card
// (`cards`, for the side list and the team line), `skills`, `preset`, `cycle` (meta/cycle, for
// the start date), and the Trainee's live public `evidence` and `changes` (null while loading).
// `kind` filters the timeline. A Trainee who left is read-only: no Talk chip.
export function traineeFile(card, { cards, skills, preset, cycle, evidence, changes, today, talk, kind }) {
  const left = isActive(card) ? null : card.left ?? { date: null };
  const days = left ? null : daysSince(card.lastTalk, today);
  const start = cycle?.start ?? today;
  const groups = [...(skills?.groups ?? [])].sort((a, b) => a.order - b.order);
  const row = (id, name) => {
    const s = card.skills?.[id];
    return { id, name, rating: rating(s, today), history: s?.a ?? [], n: s?.n ?? 0 };
  };
  const shown = groups.map((g) => {
    const rows = g.skills.map((k) => row(k.id, k.name)).filter((k, i) => !g.skills[i].archived || k.rating);
    return { id: g.id, name: g.name, mean: mean(rows.filter((k) => k.rating).map((k) => k.rating.score)), skills: rows };
  });
  const known = new Set(groups.flatMap((g) => g.skills.map((k) => k.id)));
  const unknown = Object.keys(card.skills ?? {}).filter((id) => !known.has(id)).map((id) => row(id, MARK)).filter((k) => k.rating);
  if (unknown.length) shown.push({ id: null, name: MARK, mean: mean(unknown.map((k) => k.rating.score)), skills: unknown });
  const items = (k) => (card.items ?? []).filter((i) => i.kind === k).map(({ text, by }) => ({ text, by }));
  return {
    id: card.id,
    name: card.name,
    left,
    days,
    color: left ? null : talkColor(days, talk),
    evalStage: card.evalStage ?? null,
    status: statusOf(card),
    lastTalk: card.lastTalk ?? null,
    snapshot: card.snapshot ?? null,
    start,
    nav: fileNav(cards, { today, talk }),
    growth: growth(card, { cards, skills, start, today }),
    items: { improve: items('improve'), keep: items('keep') },
    followups: (card.followups ?? []).map(({ text, date }) => ({ text, date })),
    skills: shown,
    timeline: timeline(evidence, changes, { preset, kind }),
  };
}

// Newest day first; on the same day, the higher id (written later) first.
function byDayDesc(a, b) {
  return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || b.id.localeCompare(a.id, 'en', { numeric: true });
}

// Growth and trends (ticket 08): the card's counting Assessments replayed with the Rating rule at
// the end of each Cycle week (the last week ends today). A line value is the mean Rating over the
// Skills rated by then, per Stage / Interpersonal group and overall; the team line is the mean of
// the active Trainees' values (this one included when active). null = nothing rated yet.
export function growth(card, { cards, skills, start, today }) {
  const groups = [...(skills?.groups ?? [])].sort((a, b) => a.order - b.order);
  const weeks = cycleWeeks(start, today);
  const ids = (g) => g.skills.map((k) => k.id);
  const all = groups.flatMap(ids);
  const team = cards.filter(isActive);
  const lineOf = (c, these) => weeks.map((w) => meanAt(c, these, w.end));
  const teamOf = (these) => {
    const lines = team.map((c) => lineOf(c, these));
    return weeks.map((_, i) => mean(lines.map((l) => l[i]).filter((v) => v !== null)));
  };
  const overall = { me: lineOf(card, all), team: teamOf(all) };
  const then = shiftDate(today, -28);
  const now = meanAt(card, all, today);
  const was = meanAt(card, all, then);

  // Each rated Skill's Rating today against 28 days earlier (the Trend baseline).
  const rated = groups.flatMap((g) => g.skills.map((k) => {
    const list = card.skills?.[k.id]?.a ?? [];
    const r = rating(card.skills?.[k.id], today);
    const base = ratingAt(list, then);
    return r && { id: k.id, name: k.name, group: g.name, now: r.score, stale: r.stale, delta: base ? r.score - base.score : null };
  })).filter(Boolean);
  const movers = rated.filter((k) => k.delta)
    .map(({ id, name, group, delta, now: score }) => ({ id, name, group, delta, now: score }))
    .sort((a, b) => b.delta - a.delta);
  const first = overall.me.findIndex((v) => v !== null);
  const ratedIds = new Set(rated.map((k) => k.id));

  return {
    weeks,
    // `change`: this week's value against the first week with one ("since the Cycle started").
    groups: groups.map((g) => {
      const me = lineOf(card, ids(g));
      const from = me.find((v) => v !== null) ?? null;
      const last = me.at(-1);
      return { id: g.id, name: g.name, me, team: teamOf(ids(g)), now: last, change: from !== null && last !== null ? last - from : null };
    }),
    overall,
    average: { now, delta: now !== null && was !== null ? now - was : null, team: overall.team.at(-1) },
    moves: {
      rose: movers.filter((m) => m.delta > 0).length,
      fell: movers.filter((m) => m.delta < 0).length,
      flat: rated.filter((k) => k.delta === 0).length,
      fresh: rated.filter((k) => k.delta === null).length,
    },
    movers,
    coverage: {
      rated: rated.length,
      // Skills in use: every one not archived, and an archived one while it still has a Rating.
      total: groups.flatMap((g) => g.skills).filter((k) => !k.archived || ratedIds.has(k.id)).length,
      firstWeek: first < 0 ? null : first + 1,
      stale: rated.filter((k) => k.stale).length,
    },
  };
}

// The Trainee file's side list: active Trainees by Status (those needing care first, no Status
// last), reddest first within a group as on the circles; then those who left, by name.
export function fileNav(cards, { today, talk }) {
  const item = (c) => {
    const left = !isActive(c);
    const days = left ? null : daysSince(c.lastTalk, today);
    return { id: c.id, name: c.name, evalStage: left ? null : c.evalStage ?? null, days, color: left ? null : talkColor(days, talk), left };
  };
  const reddest = (a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || a.name.localeCompare(b.name, 'he');
  const active = cards.filter(isActive);
  const status = (c) => (STATUS_LABELS[c.status?.value] ? c.status.value : 'none');
  const groups = [
    ...NAV_GROUPS.map(([key, label]) => ({ key, label, items: active.filter((c) => status(c) === key).map(item).sort(reddest) })),
    { key: 'left', label: 'עזבו', items: cards.filter((c) => !isActive(c)).map(item).sort((a, b) => a.name.localeCompare(b.name, 'he')) },
  ];
  return groups.filter((g) => g.items.length);
}

// Evidence kinds as the Commander calls them, in the order the timeline's chips list them.
export const KIND_LABELS = {
  talk: 'שיחה', test: 'תרץ', 'code-review': 'סקד', 'project-observation': 'תצפית פרויקט', 'self-assessment': 'רמ"ת',
  'improve-keep': 'שיפור/שימור', goal: 'שאיפות', background: 'רקע', 'evaluation-event': 'תהליך הערכה',
  clarification: 'הבהרה', note: 'הערה', status: 'שינוי סטטוס',
};

// The Trainee file's timeline: their live public Evidence and Status changes (from `changes`),
// newest first; `kind` narrows it to one kind ('all' or a kind not present: everything).
// null while the Evidence loads; with `changes` still loading, the Evidence shows meanwhile.
export function timeline(evidence, changes, { preset, kind = 'all' }) {
  if (!evidence) return null;
  const project = (id) => preset?.projects?.find((p) => p.id === id)?.name ?? MARK;
  const detail = (e) => {
    if (e.kind === 'test') {
      const parts = [e.test, e.score ?? (e.test ? '—' : null), e.self ? `לדבריו/ה: ${e.self}` : null].filter((x) => x != null);
      return parts.length ? parts.join(' · ') : null;
    }
    if (e.kind === 'code-review') return e.test ?? null;
    if (e.kind === 'project-observation') return e.project ? project(e.project) : null;
    return null;
  };
  const label = (k) => KIND_LABELS[k] ?? k;
  const status = (v) => (v ? STATUS_LABELS[v] ?? v : null);
  const all = [
    ...evidence.filter((e) => e.retracted === false).map((e) => ({
      id: e.id, date: e.date, at: e.at ?? '', kind: e.kind, label: label(e.kind), text: e.excerpt, detail: detail(e),
    })),
    ...(changes ?? []).filter((c) => c.retracted === false && c.type === 'status').map((c) => ({
      id: c.id, date: String(c.at).slice(0, 10), at: c.at, kind: 'status', label: label('status'),
      text: c.reason ?? '', from: status(c.from), to: status(c.to), by: c.by,
    })),
  ].sort((a, b) => cmp(b.date, a.date) || cmp(b.at, a.at) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  const order = Object.keys(KIND_LABELS);
  const present = [...new Set(all.map((e) => e.kind))]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const kinds = present.map((k) => ({ kind: k, label: label(k), count: all.filter((e) => e.kind === k).length }));
  return { kinds, entries: present.includes(kind) ? all.filter((e) => e.kind === kind) : all };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const NAV_GROUPS = [['concern', 'דורשים טיפול'], ['watch', 'במעקב'], ['good', 'במסלול'], ['none', 'ללא סטטוס']];

const isActive = (c) => c.active !== false && !c.left;
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

// The mean Rating over `ids` as of the end of `day`, or null when none is rated by then.
function meanAt(card, ids, day) {
  return mean(ids.map((id) => ratingAt(card.skills?.[id]?.a ?? [], day)).filter(Boolean).map((r) => r.score));
}

// Cycle weeks up to today: week w ends start + 7w − 1 days, the current one today.
function cycleWeeks(start, today) {
  const from = start && start <= today ? start : today;
  const n = Math.floor(daysSince(from, today) / 7) + 1;
  return Array.from({ length: n }, (_, i) => {
    const end = shiftDate(from, 7 * (i + 1) - 1);
    return { week: i + 1, end: end < today ? end : today };
  });
}
