# 25: Pre-Talk brief, team status, proactive alerts, shortcuts

**Spec:** `.scratch/student-tracker/spec.md` (Briefs, status and Advice stories 76–79, 83; Packaging → shortcuts); tickets 04, 07, 10

**What to build:** "תכין לי שיחה עם נועה" or `/student-tracker:brief נועה` gives a minute-long brief: what changed since the last Talk, open Follow-ups and next-Talk requests, 2–3 focus points, something specific to reinforce, opening questions (the same `nextTalk` questions, refreshed), and personal things worth asking about. "מה המצב" or `/student-tracker:status` gives who needs a Talk, who is declining, shared weaknesses and one team action. Replies carry proactive alerts (overdue Talks vs thresholds, a pattern repeated 3+ times, a weakness shared across Trainees). `/student-tracker:dashboard` opens the artifact.

**Blocked by:** 10, 19, 23

**Status:** resolved

- [x] `brief`, `status`, `dashboard` are user-only shortcut skills of a few lines that hand off to `tracker` by name with `$ARGUMENTS`
- [x] Reply layouts follow ticket 10's resolved samples
- [x] Brief loads `readTrainee(tid, since: 6 weeks)` and widens only when asked
- [x] "מה המצב עם נועה" routes to the brief, not team status
- [x] Brief and dashboard show the same suggested questions after a brief runs
- [x] Alerts ride on `tracker` replies only; no hooks

## Comments

**2026-10-30 — implemented** (`lib/team.mjs` (new), `lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/{brief,status,dashboard}/SKILL.md` (new), `skills/tracker/SKILL.md`, `skills/tracker/references/{brief,status,alerts}.md` (new), `skills/tracker/references/{advice,log,storage,storage-local,storage-artifact}.md`, `test/brief.test.mjs`, `test/skills.test.mjs` (new), `test/cli.test.mjs`, `evals/brief.eval.mjs` (new), `evals/advice.eval.mjs`). Built on branch `ticket-25-brief-status-alerts`, based on `integration/v1` (a1aa819).

Decisions taken while building (agent-decided, veto any):

- **Shortcuts** `brief`, `status`, `dashboard`: user-only (`disable-model-invocation: true`), `allowed-tools: Skill`, and a body of one line: run the `student-tracker:tracker` skill with "תכין לי שיחה עם $ARGUMENTS" / "מה המצב בצוות? $ARGUMENTS" / "תפתח דשבורד $ARGUMENTS". The skill is named, never its file. `test/skills.test.mjs` pins the surface: five skills, the shortcuts user-only, naming `tracker`, passing `$ARGUMENTS`, no file paths, a few lines.
- **Brief** (`references/brief.md`): the ticket 10 layout, sections in fixed order, empty ones left out, plain lines (no bold, no commentary). It reads `readTrainee(tid, 6 weeks)`, widened only on request, plus `readPlaybook(tid)` for "מיקוד (הצעה)". "מה השתנה" covers what happened after the last Talk's day (the 6 weeks read, when there's no Talk yet). "אישי" may quote sensitive records. The Rating moves are worked out by the agent from the card, using the Rating rule.
- **Opening questions = `nextTalk`.** A new storage write, `recordNextTalk(tid, questions)` (CLI `record-next-talk`, a single `--- next-talk <tid>` block): a `nextTalk` change with `entry: null`, written in one pinned step with the card. It is ticket 23's record and has its refusals: 2–3 questions, no repeats, none quoting a stored sensitive record, and none for a Trainee who left. A brief is not an Entry, so "בטל" leaves its questions alone, and they survive a Retraction of the Entry before them. The brief shows the questions it stored, so chat and the dashboard match.
- **Routing:** "מה המצב עם נועה?" / "איך נועה?" → brief; "מה המצב" / "סטטוס" / "מה המצב בצוות?" → status. With ticket 24 merged in, the router's "עוד לא נתמך" row is gone: nothing it named is left unbuilt.
- **Team status** is a new read, `readStatus` (CLI `read-status`). The lists are computed in `lib/team.mjs` from the cards, Talk settings and Skill framework, so they can be tested: `week` (week 1 = the start date's first 7 days), `needTalk` (no Talk yet first, then at or past yellow, with `level` red/yellow by the Commander's own thresholds), `declining` (Trend ↓ with `from→to`, or `concern`, or in the evaluation process; `concern` first, then in the process, then the biggest drop), `shared` (Rating ≤2 for 3+ active Trainees, archived Skills aside, most Trainees first, then lowest mean, two at most), `fine`. Trainees who left are never listed. The agent adds **one team action, always**, marked (הצעה). It is aimed at the shared weakness, else the decliners, else the Talks owed. The first eval run showed that "none when nothing is shared" wasn't what story 79 asks.
- **Alerts:** `takeAlert(pattern?)` (CLI `take-alert [<tid> <theme…>]`) returns the one alert due plus a `more` count, and marks that alert shown today in a new **`meta/alerts`** document `{shown: {key: day}}`. Priority follows ticket 10: red overdue Talk (most days first), shared weakness, the agent's pattern for the Trainee just written about, yellow overdue Talk. With no Talk yet, days count from the Cycle start, so at the start of a Cycle nobody alerts until the threshold. The agent judges a pattern (the same specific difficulty in 3+ of the Trainee's Evidence over 6 weeks) and passes a short theme. Its key is `pattern:<tid>` and **the theme is never stored**, because `meta/*` is read by the page. So it's one pattern alert per Trainee per day.
- **"A weakness newly shared"** is read as: shown once per set of Trainees sharing it, not daily. The same three stuck on the same Skill stop alerting after the first time; a fourth joining is news again. Talk and pattern alerts come back each day. Only today's keys are kept, plus weakness keys.
- **Where the line goes** (`references/alerts.md`, called from a new "Every reply ends here" step in SKILL.md): one `⚠ …` line, with ` · +N ב'מה המצב'` added when more are due. It goes just before `לביטול: 'בטל'`, or last when the reply has no Retraction line. It is skipped on the brief and on status, which don't count as showing, on a reply that only asks a question (a clarification, or "לאשר? (כן / לא)"), and when the run stopped before `readTeam`. No hooks.
- **Advice on demand** (`advice.md`) now uses the brief's "מיקוד (הצעה)" block on its own (ticket 10, point 4): a heading line, then `מיקוד (הצעה)` and 2–3 numbered points, each with its Evidence. `advice.eval.mjs` now counts the numbered points under the marker, where it used to count "(הצעה)" per line.

Not done / to raise:

- **Taste, flagged:** a weakness shared by the same Trainees alerts once, not daily. The no-Talk-yet countdown runs from the Cycle start, so a Trainee added mid-Cycle may alert red straight away. The alert waits out a question-only reply. All three can be reversed in `lib/team.mjs` / `alerts.md`.
- The pattern alert's dedupe is per Trainee per day. Two different patterns for one Trainee on the same day show only the first.
- The artifact mapping for `readStatus` / `takeAlert` asks the agent to compute the lists by hand from the cards. It is covered by the manual smoke checklist, not by tests (same as the other mappings).
- The dashboard needed no change: it already shows `card.nextTalk` under "לשיחה הבאה", and it ignores `meta/alerts`.
- Merged with ticket 24 (integration tip e2368fc). Conflicts were in the CLI usage and imports, the router's last row, log.md's reply order (the Playbook offer comes before the alert line) and cli.test.mjs. Both sides kept.

Tests: 221 unit tests on this branch (8 new brief/status/alert store tests, 1 new CLI test, 4 new skill-surface tests), 233 after merging ticket 24. Eval `evals/brief.eval.mjs` 4/4, and `evals/advice.eval.mjs` 2/2 with its new block shape. `/student-tracker:brief נועה` handed off to `tracker`. It gave every section in order, the Follow-up word-for-word, and the sensitive matter only under "אישי". It stored refreshed questions that the reply shows word-for-word, and recorded no Entry. "מה המצב עם דני?" gave Dani's brief, not team status. `/student-tracker:status` listed `אור — 22 ימים (אדום)` with one team action (הצעה), and showed no alert. A logged Test carried `⚠ אור 22 ימים בלי שיחה (אדום)` just before `לביטול: 'בטל'`, and the next reply in the same session didn't repeat it. The first run failed status on a missing team action (the doc then said "none when nothing is shared"), which led to the "always one" rule. Its brief also came out in bold with remarks around it, which led to the plain-lines rule.
