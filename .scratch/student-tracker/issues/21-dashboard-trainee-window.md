# 21: Dashboard Trainee window

**Spec:** `.scratch/student-tracker/spec.md` (Dashboard stories 98–99, 106; Dashboard page); ticket 08

**What to build:** Clicking a Talk circle opens a Trainee window: a header in the circle's colour, the Snapshot labelled "הערכה", rated Skills per Stage as 1–5 squares with their marks, "+N ללא תיעוד", details (Status, evaluation process, last Talk, Project team, goals and background from public Evidence, Evidence count), "לשיחה הבאה" (open Follow-ups word-for-word, then suggested questions marked "הצעה" when present), and a "לתיק המלא" button.

**Blocked by:** 13, 16, 19

**Status:** resolved

- [x] The page's derivation module computes Rating / Trend / stale from the card's counting-Assessment list at a given today, passing the shared fixture table from ticket 16
- [x] Rating squares dark red (1) → vibrant green (5); Trend ↑/↓; stale faded; small square for Commander-set; hatching for `n = 1`; gray "·" unrated
- [x] Reads `teams` for the Project team; filters `retracted == false`; unresolved ids render "[פרט אישי — בתיק]"
- [x] `nextTalk` questions render when present and the section degrades cleanly when absent (written by ticket 23)
- [x] Status labels במסלול / במעקב / דורש טיפול
- [x] Works at phone width; light and dark

## Comments

**2026-10-30 — implemented** (`dashboard/derive.mjs`, `dashboard/page.html` → `index.html`, `scripts/preview-dashboard.mjs`, `test/window.test.mjs`).

Clicking a Talk circle opens the Trainee window over the circles, built from the prototype's variant D window: header in the circle's colour with the evaluation tag, "לתיק המלא" and "סגירה"; Snapshot labelled הערכה; Skills per Stage and the Interpersonal group as Rating squares (shared rule from ticket 16: Trend ↑/↓, stale faded, small square for a Commander Rating, hatching for `n = 1`, gray "·") with "+N ללא תיעוד" and the legend; details (Status pill with הערכה when the agent set it, evaluation process, last Talk, Project teams, the latest goal and background, Evidence count and last date); "לשיחה הבאה" (open Follow-ups word-for-word, then the card's `nextTalk` questions marked הצעה, or "אין נקודות פתוחות").

Agent-decided (veto any):
- **One pure view function**, `traineeWindow(card, {skills, preset, teams, evidence, today, talk})` in `derive.mjs`, unit-tested with fixtures; the page only renders it.
- **Routing by hash**: `#<tid>` opens the window (so it can be linked and Back closes it), `#file:<tid>` the Trainee file. A window opened from a circle closes with Back semantics (Esc, backdrop, "סגירה"), so Back never reopens it. Focus moves to "סגירה" on open and back to the circle on close; the circles behind are `inert` while it's open.
- **Reads**: the page now also subscribes to `teams`, and to `trainees/<tid>/evidence` where `retracted == false` only while that Trainee's window is open (for goals, background and the Evidence count). `traineeWindow` filters `retracted` again. Still never `entries` or `sensitive`. A failed Evidence read shows "לא נטען", not "no Evidence".
- **Unresolved ids** render the marker: a team's unknown Project, and a rated Skill id the framework doesn't name (in a trailing group). Archived Skills show while they have a Rating and don't count as "ללא תיעוד".
- "לתיק המלא" leads to a placeholder ("התיק המלא עוד לא זמין בגרסה הזו") with ways back, until ticket 22 builds the file.

Checked by screenshot (headless Brave, stand-in db): desktop 1280px and phone 390px / 360px, light and dark; open, Esc, backdrop click and focus return checked by script.

Tests: 179 unit tests (6 new window tests).
