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
