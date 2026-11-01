# How should the dashboard artifact look and behave?

Type: prototype
Labels: wayfinder:prototype
Status: resolved
Assignee: raymandelvei (claimed 2026-10-29)
Blocked by: 01, 03

## Question

Build a rough, throwaway dashboard with fake Trainees to react to: team view (who needs a Talk, status cards, evaluation-process tags), the Skill grid (Trainees × four Stages × Skills, dark red → vibrant green, gray for no evidence, Interpersonal group alongside), a Trainee drill-down (snapshot, improve/keep, Rating history per Skill, Evidence timeline), and live summaries. Hebrew, RTL, light/dark. Decide layout, which stats matter, and drill-down depth. Constrained by what "Can a Claude Code plugin create and drive a Cycle's artifact database?" (01) finds the page can render, and by the entities from "What is the domain model of Trainees, Evidence and Ratings?" (03).

Per "What does the Playbook look like and where does its base content come from?" (04): no Playbook view on the v1 dashboard; Advice surfaces in chat and pre-Talk briefs only.

Per "How does the agent turn Evidence into a 1–5 Rating?" (05): Ratings are whole numbers; show Trend arrows (↑/↓ vs 4 weeks earlier, none without a baseline), fade stale Ratings (>6 weeks since the latest counting Assessment), decide whether to mark thin evidence (the Rating carries its Evidence count), and whether to distinguish Commander-set from agent-assessed Ratings.

Per "Which slash commands and auto-triggered skills does the plugin expose?" (07): retracted Entries and everything cut from them are hidden from every view.

Per "How does the domain model map onto the artifact database, behind what storage interface?" (09): the page reads only `meta/*`, `teams`, `trainees/<tid>` cards and per-Trainee subcollections, never `entries` or `sensitive`, so no raw Entries are shown (Evidence excerpts only; an unresolvable sensitive id renders as "[פרט אישי — בתיק]"). Rating, Trend and stale are computed from the card's counting-Assessment list at render time, and retracted records are filtered by `retracted == false`. Fake data should follow that shape.

## Assets

- Prototype of the chosen design (throwaway, fake Trainees): [published page](https://claude.ai/artifact/7DSEhhifdrqy35HAPLXvBJ), source `../prototypes/dashboard-prototype.html`.
- All variants as reacted to (primary source): `../prototypes/dashboard-prototype-all-variants.html` (A action board, B Skill matrix, C Trainee file, D Talk circles; `#variant-a`…`#variant-d`).

## Answer

Resolved with the Commander on 2026-10-29 (prototype, three rounds). Agent variants A–C were shown first; the Commander designed the main page themself (D), picked C's Trainee file as the full view, and asked for growth and trend graphs in it. A, B and C's team-summary page were dropped.

**The dashboard is three levels, read-only:**

1. **Main page: Talk circles.**
   - One circle per active Trainee, centered. Each shows the Trainee's name and the days since their last Talk.
   - The circle's color moves smoothly from green to red as days pass.
   - Sorted reddest first. An evaluation-process tag ("רף מקס") sits on the circle.
   - Trainees who left appear only as one grey line below.
   - A color bar explains the scale.
2. **Trainee window** (click a circle):
   - header in the circle's color
   - Snapshot, labelled "הערכה"
   - Skills per Stage: rated Skills as 1–5 squares with their names, plus "+N ללא תיעוד"
   - details: Status, evaluation process, last Talk, Project team, goals and background (from public Evidence), Evidence count
   - **"לשיחה הבאה"**: open Follow-ups word for word, then 2–3 suggested questions marked "הצעה"
   - a "לתיק המלא" button
3. **Trainee file** (full page):
   - Side list of Trainees grouped by Status, with those who left at the end, plus a way back to the circles.
   - Header: Status, evaluation tag, days-since-Talk chip and Snapshot.
   - **צמיחה ומגמות**, in this order:
     - three tiles: the average across all Skills (with its change vs 4 weeks ago, the team average and a sparkline), how many Skills rose or fell in 4 weeks, and Skill coverage
     - one small line chart per Stage (four Stages plus בין-אישי), Trainee vs team average, week by week on one 1–5 scale, with a hover readout and a table view
     - "מה זז ב-4 השבועות האחרונים": bars for the Skills that rose or fell
   - Below that:
     - improve/keep items
     - open Follow-ups
     - every Skill with its Rating square, a history strip and its Evidence count
     - the Evidence timeline, filterable by kind, with Status changes in it

**Decided by the Commander**
- The main page is the Talk circles. There is no team-wide view on the dashboard: no Skill grid for all Trainees, no team stats, no recent-Evidence feed. Team questions (who needs a Talk, shared weaknesses) stay in chat (`status`).
- **Suggested Talk questions appear on the dashboard.** This overrides "What does the Playbook look like and where does its base content come from?" (04), where Advice was never shown on the dashboard and never stored. Page code can't generate text, so the agent stores display-safe questions on the Trainee card. They are still marked "הצעה" and still never become records unless the Commander accepts one.

**Agent-decided (veto any)**
1. **Circle color** is anchored on the Commander's Talk settings: green at 0 days, lime at the target, amber at the yellow threshold, red at threshold + 7, and deep red from threshold + 14. "No Talk yet" is the deepest red. A settings change moves the scale with it.
2. **Rating marks** follow the rules from "How does the agent turn Evidence into a 1–5 Rating?" (05):
   - Trend ↑/↓ vs 4 weeks earlier, none without a baseline
   - stale Ratings faded
   - a small square marks a Commander-set Rating
   - hatching marks a Rating resting on a single Evidence (`n = 1`)
   - gray "·" means no evidence yet
3. **Growth metric**:
   - It is the mean of a Trainee's Ratings at the end of each Cycle week, over the Skills rated by then, per Stage and overall.
   - The team line is the mean of active Trainees and includes the Trainee themself.
   - It is computed at render time by replaying the card's counting-Assessment list with the Rating rule, so it needs no new storage.
4. **Time runs right to left** (Cycle start on the right) on every chart and history strip, matching the RTL page.
5. **No test-score chart** in v1. The course notes rank Skill growth above scores, and scores are often not given.
6. **Chart colors**: Trainee blue, team gray, decline red. The blue/red pair passes the CVD and contrast checks in light and dark mode. Rating squares keep the dark red → green ramp.
7. **Theme** follows the viewer's light/dark setting. The page has no toggle of its own.
8. **Hebrew copy**: Status labels are במסלול / במעקב / דורש טיפול, the placeholder is "[פרט אישי — בתיק]", and agent text is labelled הערכה / הצעה.

Knock-on effects recorded on other tickets:
- **Storage mapping**: the Trainee card gains `nextTalk: {questions, at}`, written display-safe by the agent whenever that Trainee's records change. The page also reads `teams`, for the Project team.
- **Chat replies**: the pre-Talk brief should reuse and refresh the same suggested questions, so chat and the dashboard agree.
- **Playbook**: the "no Advice on the dashboard" rule is overridden for Talk questions.
