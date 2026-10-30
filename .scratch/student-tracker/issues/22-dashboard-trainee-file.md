# 22: Dashboard Trainee file

**Spec:** `.scratch/student-tracker/spec.md` (Dashboard stories 100–105, 107); ticket 08 (variant C + growth section)

**What to build:** "לתיק המלא" opens the full Trainee file: a side list of Trainees grouped by Status (left at the end) with a way back to the circles; a header with Status, evaluation tag, days-since-Talk chip and Snapshot; "צמיחה ומגמות" (three tiles, one line chart per Stage plus בין-אישי — Trainee vs team, week by week, hover readout and table view — and "מה זז ב-4 השבועות האחרונים" bars); then improve/keep items, open Follow-ups, every Skill with its square, history strip and Evidence count, and the Evidence timeline filterable by kind with Status changes in it.

**Blocked by:** 21

**Status:** resolved

- [x] Growth metric replays the card's Assessment lists week by week (mean of rated Skills per Stage and overall; team = mean of active Trainees including this one); unit-tested on fixtures
- [x] 4-week movers and the "rose/fell" tile unit-tested on fixtures
- [x] Time runs right to left on every chart and history strip
- [x] Chart colours: Trainee blue, team gray, decline red, legible in light and dark
- [x] Per-Trainee subcollections are subscribed only while the file is open
- [x] No test-score chart, no team-wide grid, no Playbook view

## Comments

**2026-10-30 — implemented** (`dashboard/derive.mjs`, `dashboard/page.html` → `index.html`, `scripts/preview-dashboard.mjs`, `test/file.test.mjs`).

"לתיק המלא" (and `#file:<tid>`) opens the Trainee file, built from the prototype's variant C: a side list of Trainees grouped by Status (דורשים טיפול, במעקב, במסלול, ללא סטטוס, then עזבו), each with its evaluation tag and a days-since-Talk chip in the circle's colour, and "→ לעיגולי השיחות"; on a phone the list becomes a scrolling row with the current Trainee scrolled into view. Header: name, Status pill, evaluation tag, days chip, last Talk (or when they left), the Snapshot labelled הערכה. "צמיחה ומגמות": three tiles (average across all Skills with its change vs 4 weeks ago, the team average and a sparkline; how many Skills rose / fell / stayed / are new in 4 weeks; coverage with the first rated week and the stale count), one line chart per Stage plus בין-אישי (Trainee blue vs team gray, 1–5, week ticks, hover readout with a crosshair, "הצג כטבלה"), and "מה זז ב-4 השבועות האחרונים" bars (rise blue, fall red, hover readout). Then improve / keep items (the agent's marked הצעה), open Follow-ups, every Skill per Stage with its Rating square, history strip (circle = agent, square = Commander, Cycle start on the right) and Evidence count, and the timeline: live Evidence and Status changes, newest first, filterable by kind with counts.

Agent-decided (veto any):
- **Pure view functions** in `derive.mjs`, unit-tested on fixtures: `growth()` (week-end replay, team line, average / movers / coverage tiles, each Stage's value and change since its first rated week), `fileNav()`, `timeline()`, and `traineeFile()` composing them. The page only renders.
- **Weeks**: week w ends on start + 7w − 1, the current week today. "Change vs 4 weeks ago" and the movers compare today with exactly 28 days earlier, the Trend baseline, so the tile and the squares' arrows agree.
- **Team line**: active Trainees only; a Trainee who left is compared with the active team, without themself, and their header says they're not in the team average.
- **Coverage** counts Skills in use: not archived, or archived but still rated. Rated Skills the framework doesn't name show in a trailing group as the marker (as in the window); they are left out of the growth lines.
- **Side list order**: reddest first within each Status group (as on the circles); Trainees with no Status yet get their own group "ללא סטטוס"; those who left by name. Items are links to `#file:<tid>`, so Back moves between files.
- **Timeline**: Status changes come from `trainees/<tid>/changes` (type `status`), shown as "from ← to" with the reason and הערכה (agent) / מפקד. Other change types (stage, Snapshot, roster) are not shown; the evaluation process shows through its evaluation-event Evidence. A Test shows its name, score and the Trainee's own words on the line (no chart). Projects resolve to their preset name, else the marker.
- **Reads**: the Trainee's `evidence` (window or file open) and `changes` (file open only), each `where retracted == false`, dropped when the file closes or switches; still never `entries` or `sensitive`. Live updates redraw only when the HTML changes, keep focus by id, and keep the table view open; the timeline filter resets when switching Trainee.
- Chart tokens from the prototype (`--s1` blue, `--cmp` gray, `--down` red, light and dark).

Not done / to raise:
- No keyboard path to the per-week hover readout; the table view is the accessible equivalent (as in the prototype).

Checked by screenshot (headless Brave, stand-in db with a richer sample: 62-day Cycle, Status changes, more Evidence kinds, team filler Ratings): desktop 1280px light and dark; phones 390px / 360px (an active Trainee, one with little data, one who left). Hover readout, kind filter, table toggle, switching Trainee, window → file and back to the circles checked by a probe script.

Tests: 192 unit tests (13 new file tests). No evals touched.
