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

// Every problem with a base Playbook against a Skill framework ({groups: [{skills: [{id}]}]}),
// as one line each; [] when it is consistent. Ids are `b-<number>`, never repeated and never
// one of `retired` (ids of items taken out, so an id is never reused for another text).
export function checkPlaybook(playbook, framework) {
  const known = new Set((framework?.groups ?? []).flatMap((g) => g.skills.map((s) => s.id)));
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
    if (!PLAYBOOK_KINDS.includes(it.kind)) out.push(`${at}: kind is one of ${PLAYBOOK_KINDS.join(', ')}, got "${it.kind}"`);
    if (typeof it.text !== 'string' || !it.text.trim()) out.push(`${at}: needs its text`);
    const tags = Array.isArray(it.skills) ? it.skills : [];
    if (!tags.length) out.push(`${at}: tagged to at least one Skill id, or ["general"]`);
    if (tags.includes(GENERAL) && tags.length > 1) out.push(`${at}: "general" stands alone, not with Skills`);
    if (new Set(tags).size !== tags.length) out.push(`${at}: a Skill tagged twice`);
    for (const s of tags) if (s !== GENERAL && !known.has(s)) out.push(`${at}: unknown Skill "${s}"`);
    if (it.band !== undefined && !BANDS[it.band]) out.push(`${at}: band is one of ${Object.keys(BANDS).join(', ')}, got "${it.band}"`);
    if (it.band !== undefined && tags.includes(GENERAL)) out.push(`${at}: a general item has no band (it has no Rating to fit)`);
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
  const named = Object.fromEntries(skills.map((s) => [s.id, s]));
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
