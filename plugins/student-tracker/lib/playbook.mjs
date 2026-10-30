// The Playbook (ticket 04): the base items that ship in data/playbook.json, merged on read with
// the Commander's own items and hides, and the pick of items Advice draws on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './docs.mjs';

const BASE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/playbook.json');

export const PLAYBOOK_KINDS = ['sign', 'tip', 'exercise', 'talk-question'];
export const GENERAL = 'general';
// Level bands over a 1–5 Rating; an item with no band fits any level.
export const BANDS = { low: [1, 2], mid: [3], high: [4, 5] };
const ITEM_KEYS = ['id', 'origin', 'kind', 'skills', 'band', 'text'];

// {id: Skill} for every Skill of a framework ({groups: [{skills: [{id}]}]}).
const skillsOf = (framework) => Object.fromEntries((framework?.groups ?? []).flatMap((g) => g.skills.map((s) => [s.id, s])));

// What is wrong with one item's kind, text, Skill tags and band (a band of null or undefined is
// none), as one line each; [] when nothing is. `known`: the framework's Skills by id.
function itemProblems({ kind, text, skills, band }, known) {
  const out = [];
  if (!PLAYBOOK_KINDS.includes(kind)) out.push(`kind is one of ${PLAYBOOK_KINDS.join(', ')}, got "${kind}"`);
  if (typeof text !== 'string' || !text.trim()) out.push('needs its text');
  const tags = Array.isArray(skills) ? skills : [];
  if (!tags.length) out.push('tagged to at least one Skill id, or ["general"]');
  if (tags.includes(GENERAL) && tags.length > 1) out.push('"general" stands alone, not with Skills');
  if (new Set(tags).size !== tags.length) out.push('a Skill tagged twice');
  for (const s of tags) if (s !== GENERAL && !known[s]) out.push(`unknown Skill "${s}"; use a Skill id from meta/skills`);
  if (band != null && !BANDS[band]) out.push(`band is one of ${Object.keys(BANDS).join(', ')}, or none, got "${band}"`);
  if (band != null && tags.includes(GENERAL)) out.push('a general item has no band (it has no Rating to fit)');
  return out;
}

// Every problem with a base Playbook against a Skill framework ({groups: [{skills: [{id}]}]}),
// as one line each; [] when it is consistent. Ids are `b-<number>`, never repeated and never
// one of `retired` (ids of items taken out, so an id is never reused for another text).
export function checkPlaybook(playbook, framework) {
  const known = skillsOf(framework);
  const retired = new Set(playbook?.retired ?? []);
  const seen = new Set();
  const out = [];
  if (!Array.isArray(playbook?.items)) return ['the base Playbook has no items list'];
  for (const it of playbook.items) {
    const at = it?.id ?? '(no id)';
    const extra = Object.keys(it ?? {}).filter((k) => !ITEM_KEYS.includes(k));
    if (extra.length) out.push(`${at}: unknown field ${extra.join(', ')}`);
    if (typeof it.id !== 'string' || !/^b-\d{3,}$/.test(it.id)) out.push(`${at}: an id is b-<number>, got "${it.id}"`);
    else if (seen.has(it.id)) out.push(`${it.id}: used twice`);
    else if (retired.has(it.id)) out.push(`${it.id}: retired, never reused`);
    seen.add(it.id);
    if (it.origin !== 'base') out.push(`${at}: a shipped item's origin is base, got "${it.origin}"`);
    if (it.band === null) out.push(`${at}: a shipped item with no band leaves band out`);
    out.push(...itemProblems(it, known).map((p) => `${at}: ${p}`));
  }
  return out;
}

// The shipped base items, checked against `framework` (the shipped one by default).
export function basePlaybook(framework) {
  const playbook = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
  const problems = checkPlaybook(playbook, framework);
  if (problems.length) throw new StoreError(`the shipped base Playbook is inconsistent: ${problems.join('; ')}`);
  return playbook.items;
}

// How many Skills Advice targets when the Commander names no focus.
const MAX_TARGETS = 3;

const fits = (item, score) => !item.band || (score != null && BANDS[item.band].includes(score));
const shape = ({ id, origin, kind, skills, band, text }) => ({ id, origin, kind, skills, band: band ?? null, text });

// The Playbook items Advice draws on for one Trainee, from their `card`; `rate(skill, today)` is
// the Rating rule. The live items are the Commander's (`own`, not retired) first, then the base
// ones not in `hidden` (a hidden id that no longer ships is simply never met). Targets are the
// `focus` Skills when given, else the declining (↓) Skills, then the lowest-rated, MAX_TARGETS at
// most (archived Skills aside). Each target gets the items tagged to it whose band fits its
// Rating (an unrated Skill: untagged items only); `general` items come apart.
export function pickPlaybook({ base, own = [], hidden = [], framework, card, today, rate, focus = [] }) {
  const skills = (framework?.groups ?? []).flatMap((g) => g.skills);
  const named = skillsOf(framework);
  for (const s of focus) if (!named[s]) throw new StoreError(`unknown Skill "${s}"; use a Skill id from meta/skills`);
  const off = new Set(hidden);
  const live = [
    ...own.filter((i) => !i.retired).map((i) => ({ ...i, origin: 'commander' })),
    ...base.filter((i) => !off.has(i.id)),
  ].map(shape);
  const ratingOf = (sid) => rate(card.skills?.[sid], today);
  const byScore = (a, b) => a.r.score - b.r.score || a.order - b.order;
  let picked;
  if (focus.length) {
    picked = [...new Set(focus)].map((sid) => ({ sid, r: ratingOf(sid), focus: true }));
  } else {
    const rated = skills
      .map((s, order) => ({ sid: s.id, r: s.archived ? null : ratingOf(s.id), order, focus: false }))
      .filter((t) => t.r);
    const down = rated.filter((t) => t.r.trend < 0).sort(byScore);
    const rest = rated.filter((t) => !(t.r.trend < 0)).sort(byScore);
    picked = [...down, ...rest].slice(0, MAX_TARGETS);
  }
  return {
    targets: picked.map(({ sid, r, focus: f }) => ({
      skill: sid,
      name: named[sid].name,
      rating: r?.score ?? null,
      trend: r?.trend > 0 ? '↑' : r?.trend < 0 ? '↓' : null,
      focus: f,
      items: live.filter((i) => i.skills.includes(sid) && fits(i, r?.score)),
    })),
    general: live.filter((i) => i.skills.includes(GENERAL)),
  };
}

// The fields of a Commander item the Commander gives (the rest the store fills in).
const OWN_KEYS = ['kind', 'skills', 'band', 'text', 'source'];

// A Commander item as it will be stored, from `given` over `current` (an edit) or nothing (a new
// one), checked against the Cycle's Skill framework: a known kind, the text word-for-word and not
// empty, Skill ids of this Cycle (not archived) or ["general"] alone, an optional band (none on a
// general item; `band: null` clears it). Throws a StoreError on the first problem.
export function ownItem(given, framework, current = null) {
  const extra = Object.keys(given ?? {}).filter((k) => !OWN_KEYS.includes(k));
  if (extra.length) throw new StoreError(`unknown field ${extra.join(', ')} (a Playbook item has ${OWN_KEYS.join(', ')})`);
  const pick = (k, fallback) => (given[k] !== undefined ? given[k] : current ? current[k] : fallback);
  const kind = pick('kind');
  const skills = pick('skills', []);
  const band = pick('band', null) ?? null;
  const text = pick('text');
  const source = pick('source', null) ?? null;
  const known = skillsOf(framework);
  const [problem] = itemProblems({ kind, text, skills, band }, known);
  if (problem) throw new StoreError(`a Playbook item: ${problem}`);
  for (const s of skills) {
    if (known[s]?.archived && !current?.skills.includes(s)) throw new StoreError(`${s} is archived; it takes no new Playbook items`);
  }
  return { origin: 'commander', kind, skills, band, text: text.trim(), source };
}
