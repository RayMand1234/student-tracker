# 16: Assessments and Ratings

**Spec:** `.scratch/student-tracker/spec.md` (Domain rules → Rating rule; Chat replies → confirmation line); ticket 05

**What to build:** Each update moves Skill Ratings the way the Commander expects. The agent writes Assessments only on Skills the Evidence speaks to, holistically and citing Evidence, and lists each one on the confirmation line. A direct Commander rating ("הדיבאג של נועה זה 4") is a note Evidence plus a Commander Assessment that stays authoritative; later agent judgments are kept but don't count, and a disagreement of 1+ shows as a "(הצעה)" proposal the Commander can accept. Self-assessment gaps of 2+ yield a מודעות עצמית Assessment, and "תדרג מחדש את X" re-reviews a Trainee.

**Blocked by:** 14

**Status:** resolved

- [x] Assessments: whole number 1–5, author agent | Commander | Trainee, reason, ≥1 Evidence id, dated, immutable, `retracted: false`
- [x] Test scores alone never produce an Assessment
- [x] The card holds per Skill the counting Assessments `[[date, score, author], …]` and Evidence count `n`
- [x] Confirmation lines: `דיבאג 2→3 (הערכה): <reason> — <Evidence kind + date>`, `נשאר 3`, `—→3`, and `(הצעה) מציע לעדכן …` against a Commander value; accepting writes a Commander Assessment
- [x] רמ"ת self-scores are Trainee-authored, never count; gap ≥2 from the Rating → agent Assessment on מודעות עצמית citing the gap direction
- [x] "תדרג מחדש את X" reviews every Skill with Evidence, writing only where judgment changed (`a-…` ids, `entry: null`); a clarification re-assesses the Skills it touched
- [x] A shared fixture table (Assessment lists + today → Rating, Trend, stale) exists and drives a Rating eval; ticket 21 reuses it for the page

## Comments

Decisions taken while building (agent-decided, veto any):

- **New storage operation `recordAssessments(tid, assessments)`** for Assessments outside an Entry (re-rate, an accepted proposal): `a-…` ids, `entry: null`, dated today, one version-pinned write with the card. The spec's operation list had no home for them.
- **An Assessment's `date`** is the latest date of the Evidence it cites when written with an Entry, so backfilled or late-logged history keeps its place in Trend; one resting only on old Evidence slots in behind newer Assessments and the reply says "נשאר".
- **Card `skills`** = `{a, n}` per Skill: `a` drops every agent Assessment after the Commander's first (kept, never counts), so stale follows the Commander's last word; `n` counts the Evidence cited by the Assessments in `a`.
- Evidence is cited as `#<n>` (this Entry's record `<entryId>-<n>`) or by stored id. A Trainee-authored Assessment must cite a `self-assessment` Evidence.
- The page's `rating()` landed in `dashboard/derive.mjs` now, so the shared fixture table (`test/fixtures/ratings.mjs`) runs through store → card → derivation in `test/ratings.test.mjs`; ticket 21 only has to render it. "מה הדירוג של…" in recall is how the Rating eval reads the agent's rule back.
- Left for ticket 17: "בטל" retracts Entries only, so a standalone re-rate or accepted proposal can't be undone that way yet; the reply for those has no Retraction line.
