# Spec: `student-tracker` Claude Code plugin (v1)

Type: spec
Status: ready-for-agent
Blocked by:
Created: 2026-10-29

Synthesized from the map (`.scratch/student-tracker/map.md`), resolved tickets 01–09, `GLOSSARY.md`, `docs/skill-framework.md` and ADRs 0001–0002. Vocabulary follows `GLOSSARY.md`; capitalized terms (Commander, Trainee, Cycle, Entry, Evidence, Assessment, Rating, …) are used exactly as defined there.

## Problem Statement

A Commander in the Fullstack Course family personally mentors a handful of Trainees across a 21-week Cycle. What they know about each Trainee is scattered across their own head, chat messages and notes: who they last had a Talk with, how a Trainee did on a Test or a code review, what was said in a Talk, which weakness keeps coming back, what to follow up on. Nothing tells them who is overdue for a Talk, whether a Trainee is actually growing in the Skills that matter (debugging, understanding the requirement, teamwork…), or what to ask next time. Their earlier claude.ai-project skill required manual project setup, lived in files the dashboard couldn't read live, and was not something another Commander could install. Sensitive personal details (health, family, distress) need to be kept but never displayed.

## Solution

A Claude Code plugin, `student-tracker`, that any Commander installs from a public GitHub marketplace and starts with `/student-tracker:setup`. Setup asks one batched Hebrew question, then creates a private, pinned claude.ai artifact per Cycle ("מעקב חניכים · <Cycle>") whose database is the single source of truth and whose page is a live, read-only dashboard.

After setup, the Commander just writes in chat, in Hebrew, the way they already talk ("דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב"). The agent keeps the message word-for-word as an Entry, cuts it into per-Trainee Evidence, flags sensitive details, writes Assessments on the Skills the Evidence speaks to, updates Follow-ups and improve/keep items, and replies with a short confirmation that can be undone with "בטל". It prepares pre-Talk briefs and team status with tailored Advice drawn from a shipped base Playbook plus the Commander's own items. The dashboard opens on Talk circles (green → red by days since the last Talk), drills into a Trainee window with suggested next-Talk questions, and into a full Trainee file with growth and trend charts. Sensitive Evidence and raw Entries are stored but never read by the page.

## User Stories

### Install and setup

1. As a Commander, I want to install the plugin from a public GitHub marketplace with two `/plugin` commands, so that I don't need to copy files or configure a project by hand.
2. As a Commander, I want setup to check first that my Claude Code session can create artifacts, so that I learn about a missing plan, login or policy before answering any questions.
3. As a Commander whose session lacks artifact tools, I want one Hebrew message listing the likely causes and fixes (paid plan, `/login` with a claude.ai account, no API key/Bedrock/Vertex, org policy or `enableArtifact`, `-p` mode), so that I can fix it myself.
4. As a Commander, I want setup to ask everything in one batched Hebrew message with defaults shown inline, so that I'm not interrogated question by question.
5. As a Commander, I want only my name and the Cycle name/color to be mandatory, so that I can start tracking in under a minute.
6. As a Commander, I want sensible defaults for role, Talk target (10 days, yellow 10 / red 14), Cycle start date (today) and Course preset (shipped Fullstack), so that I only answer what differs.
7. As a Commander, I want to see the Course preset as a 3–4 line summary and answer "תואם לקורס שלך?" in free text, so that differences in my course are applied to this Cycle's copy without editing files.
8. As a Commander, I want the agent to show what it changed in the preset, so that I can verify my free-text corrections were understood.
9. As a Commander, I want to optionally give Trainee first names, extra info per Trainee, Project teams and extra Skills at setup or later in chat, so that a partial roster doesn't block me.
10. As a Commander, I want extra info I give about a Trainee at setup to be treated like any later update (split into Evidence, sensitive details flagged), so that nothing I say at setup bypasses the normal rules.
11. As a Commander with two Trainees sharing a first name, I want to be asked for a short distinguishing label ("נועה כ."), so that updates go to the right Trainee without storing extra identifying details.
12. As a Commander, I want a confirmation summary ("זה מה שאקים — לאשר?") and a warning that Claude Code will ask permission once to publish, so that nothing is created before I agree.
13. As a Commander, I want the dashboard artifact to be private and pinned in my claude.ai sidebar, so that only I can see it and I can find it from any device.
14. As a Commander, I want a Hebrew hand-off message with what was created, the dashboard link, three starter phrases and a line on enabling auto-update, so that I know how to start using it.
15. As a Commander setting up on a new machine or after reinstalling, I want setup to find my existing Cycle by title and offer "להתחבר למחזור <name>, או להתחיל מחזור חדש?", so that I reconnect instead of creating a duplicate.
16. As a Commander whose setup was interrupted, I want re-running setup to resume seeding into the same artifact and re-show the summary, so that I never end up with two half-built artifacts.
17. As a Commander starting a new Cycle, I want my name, role, Talk thresholds, Playbook items and base-item hides carried over from the previous Cycle ("ממשיך עם: … — לשנות?"), so that I don't redo my personal setup every Cycle.
18. As a Commander starting a new Cycle, I want the previous Cycle's artifact kept as an archive, so that past Trainees' records are still available to read.

### Finding the Cycle in every session

19. As a Commander, I want every non-setup command to silently connect to my current Cycle, so that I never paste a URL.
20. As a Commander on a machine with no cached pointer, I want the agent to look up my Cycle by title and cache it when there is exactly one, so that a new machine just works.
21. As a Commander with several matching Cycles and no pointer, I want to be asked which one, so that the agent doesn't guess.
22. As a Commander who hasn't run setup, I want to be told "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`", so that I know the next step.

### Logging updates

23. As a Commander, I want to write an update in free text and have it recorded without a confirmation step when it clearly concerns known Trainees, so that logging takes seconds.
24. As a Commander, I want my message kept whole and word-for-word as an Entry, so that the agent's split can be checked or redone later.
25. As a Commander, I want one message mentioning several Trainees split into one Evidence per Trainee, each with its own word-for-word excerpt, so that each Trainee's record only holds what's about them.
26. As a Commander, I want a team-wide sentence ("כל הצוות היה מעולה בפאדנס") to become one Evidence per Trainee linked to the same Entry, so that it appears on each Trainee's record.
27. As a Commander, I want Evidence classified into its kind (Talk, test, code review, project observation, self-assessment form, improve/keep, goal, background, evaluation-process event, note, clarification), so that views and briefs can filter by kind.
28. As a Commander, I want dates like "אתמול" or "ביום שני" resolved to the actual day the thing happened, so that the timeline is accurate even when I log late.
29. As a Commander, I want Test names in any spelling ("פוב", "FOV") resolved to the canonical Test from the preset, so that test records are consistent.
30. As a Commander, I want an ambiguous "תרץ 1" resolved by the Cycle's Schedule for that date, and asked about only if still unclear, so that I don't have to be precise.
31. As a Commander mentioning an unknown Test, I want it recorded as written, flagged, and added to the catalog only after I confirm, so that my words are kept and the catalog stays clean.
32. As a Commander mentioning an unknown name, I want to be asked before anything is recorded, so that no Trainee is created by mistake.
33. As a Commander, I want text that might be a question rather than an update to trigger a short question back, so that questions aren't logged as Evidence.
34. As a Commander, I want a test score kept only when I gave one, never guessed, so that records hold only what I said.
35. As a Commander, I want a Trainee's own verdict on a Test kept on that Test's Evidence, so that self-perception is visible next to the result.
36. As a Commander, I want Talks to record topics and the Follow-ups they open and close, so that the next Talk starts where the last one ended.
37. As a Commander, I want the last Talk date updated from Talk Evidence, so that the Talk circles and overdue alerts are correct.
38. As a Commander, I want a correction to be recorded as a clarification linked to the original Evidence, so that nothing I wrote is edited.
39. As a Commander, I want a short confirmation reply after each update listing what was recorded per Trainee, each Assessment written, new Follow-ups, and ending with "לביטול: 'בטל'", so that I can check the agent's reading at a glance.

### Sensitive details

40. As a Commander, I want sentences about health, family, distress, finances, romantic relationships or discipline/legal matters split into their own sensitive Evidence, so that they're kept but separable.
41. As a Commander, I want the public part of that Evidence to show "[פרט אישי — בתיק]" in place of the sensitive sentence, so that the dashboard never exposes it.
42. As a Commander, I want to be told when the agent marked something sensitive, and to be able to flip the mark either way, so that I control what is hidden.
43. As a Commander, I want the dashboard page to never read raw Entries or sensitive records at all, so that hiding doesn't depend on display logic alone.
44. As a Commander, I want to see a Trainee's sensitive records and my original messages in chat when I ask ("מה כתבתי על נועה ב-12/10?"), so that nothing is lost to me.
45. As a Commander, I want a reminder to involve a professional (קב"ן / ת"ש / מפקד) when Evidence signals serious distress, so that I don't miss an escalation.
46. As a Commander, I want Assessment reasons, Snapshots and Status-change reasons written display-safe (citing sensitive Evidence by id only), so that derived text can't leak a sensitive detail.

### Retraction

47. As a Commander, I want "בטל" to retract my last Entry, so that a wrong log can be withdrawn immediately.
48. As a Commander, I want to retract an earlier Entry by naming it, so that I can fix a mistake found later.
49. As a Commander, I want a retracted Entry's Evidence, Assessments, Follow-ups and improve/keep items to stop counting and stop showing but stay stored, so that the record is honest and nothing is silently deleted.
50. As a Commander, I want a hard delete only when I explicitly ask for one, so that the default is always to keep records.

### Assessments and Ratings

51. As a Commander, I want the agent to write Assessments only on Skills the Evidence actually speaks to, so that Ratings aren't padded with guesses.
52. As a Commander, I want each agent Assessment to judge the whole picture (recent ~4 weeks weighted most) and cite the Evidence it used, so that I can see why.
53. As a Commander, I want one shared 1–5 scale (1 לא מתפקד … 5 מצוין, יכול ללמד אחרים) for every Skill, so that Ratings are comparable.
54. As a Commander, I want a Rating to be the latest counting Assessment as a whole number, so that it's simple and explainable.
55. As a Commander, I want test scores alone never to produce a Skill Assessment, so that Skills reflect how the Trainee worked, not a number.
56. As a Commander, I want to set a Rating directly ("הדיבאג של נועה זה 4") and have it recorded as a note Evidence plus a Commander Assessment, so that my overrides are evidence-backed too.
57. As a Commander, I want my Assessment to stay authoritative for that Skill; later agent judgments are kept but don't count, so that the agent never silently overrules me.
58. As a Commander, I want the agent to propose "(הצעה) מציע לעדכן …" when its judgment differs from my Rating by 1 or more, and accepting it records a new Commander Assessment, so that I stay in control but get the signal.
59. As a Commander, I want a Trainee's self-assessment (רמ"ת) to never count toward a Rating, but a gap of 2 or more to produce an Assessment on מודעות עצמית, so that self-awareness is tracked.
60. As a Commander, I want to ask "תדרג מחדש את X" and have the agent review every Skill with Evidence and write only where its judgment changed, so that I can request a fresh look.
61. As a Commander, I want a clarification that corrects backing Evidence to trigger re-assessment of the Skills it touched, so that Ratings follow corrections.
62. As a Commander, I want each Rating to carry a Trend (↑/↓ vs 4 weeks earlier, none without a baseline), so that I see direction, not only level.
63. As a Commander, I want Ratings with no counting Assessment in 6+ weeks shown faded as stale, without their value decaying, so that I know what nobody has looked at lately.
64. As a Commander, I want to add a Skill to a Stage or the Interpersonal group for this Cycle, and have the agent propose one when a theme recurs 3+ times, so that the framework fits my Trainees.
65. As a Commander, I want removed Skills archived, never deleted, so that past Assessments keep their meaning.

### Trainee state

66. As a Commander, I want the agent to propose a Trainee's Status (במסלול / במעקב / דורש טיפול) with a reason, and to override it myself, so that Status reflects my judgment.
67. As a Commander, I want every Status change recorded with from → to, when, by whom, why and on what Evidence, so that I can see the history.
68. As a Commander, I want the evaluation-process stage (רף מקס → רף רמד → רף מפקד היחידה → הדחה) to change only when I say so, recorded as both Evidence and a stage-change record, so that the agent never escalates on its own.
69. As a Commander, I want to mark a Trainee as left (dismissal, transfer, other) with a date and reason, so that they drop out of team stats but keep their records read-only.
70. As a Commander, I want the agent to keep a short Snapshot per Trainee, regenerated as Evidence arrives and labelled as an assessment, so that I have an at-a-glance summary.
71. As a Commander, I want improve/keep items to have a lifecycle (active → retired) with mine kept word-for-word and the agent's marked "(הצעה)", so that the Trainee's card shows current feedback only.
72. As a Commander, I want Follow-ups to stay open until a later Evidence closes them, so that I never forget something I meant to check.
73. As a Commander, I want to record Project teams per Cycle and link project observations to their team, so that interpersonal observations have context.
74. As a Commander, I want roster and settings changes (add a Trainee, a Trainee leaving, Talk thresholds, name/role, Status override, evaluation stage, preset edits, Project teams) confirmed before they apply, so that rare, weighty changes aren't made by misreading.
75. As a Commander, I want to change settings in chat ("שנה יעד שיחות ל-7"), so that I never re-run setup for a tweak.

### Briefs, status and Advice

76. As a Commander, I want "תכין לי שיחה עם X" or `/student-tracker:brief X` to give a short brief readable a minute before the Talk, so that I walk in prepared.
77. As a Commander, I want the brief to cover what changed since the last Talk, open Follow-ups and "for next Talk" requests, 2–3 focus points, something specific and positive to reinforce, opening questions, and personal things worth asking about, so that the Talk is personal and continuous.
78. As a Commander, I want the brief's suggested questions to be the same ones on the dashboard (and refreshed together), so that chat and dashboard agree.
79. As a Commander, I want "מה המצב" or `/student-tracker:status` to tell me who needs a Talk now, who is declining, weaknesses shared across Trainees, and one action for the whole team, so that I can plan my week.
80. As a Commander, I want to ask "איך לעזור ל-X בדיבאג?" and get 2–3 suggestions grounded in that Trainee's Evidence, so that advice is specific, not generic.
81. As a Commander, I want Advice to target the Trainee's lowest or declining Skills (or a focus I name), fit their Rating band, prefer my own Playbook items, skip what was already tried without effect, and cite Evidence, so that suggestions are relevant.
82. As a Commander, I want Advice always marked "(הצעה)" and never stored unless I accept it as an improve/keep item or Follow-up, so that suggestions don't pollute the record.
83. As a Commander, I want overdue-Talk alerts (against my yellow/red thresholds), patterns repeated 3+ times, and weaknesses shared across Trainees mentioned proactively on the agent's replies, so that I notice without asking.

### Playbook

84. As a Commander, I want a shipped base Playbook of signs, tips, exercises and Talk questions per Skill (and "general"), so that Advice works from day one.
85. As a Commander, I want to add my own Playbook items in chat ("תוסיף לפלייבוק של דיבאג: …"), kept word-for-word and confirmed before saving, so that my experience feeds future Advice.
86. As a Commander, I want the agent to offer to save something that worked from an update as a Playbook item, never adding it without my yes, so that good practice is captured without clutter.
87. As a Commander, I want to edit or retire my own items and hide or un-hide base items, so that the Playbook reflects what I believe in.
88. As a Commander, I want my Playbook items and hides to belong to me, not the Cycle, so that they carry into my next Cycle.
89. As a Commander with a Skill I added, I want draft items "(הצעה)" offered for it, so that my custom Skills get Advice too.
90. As a Commander, I want base Playbook improvements to arrive through plugin updates without losing my hides, so that I benefit from improvements.

### Dashboard

91. As a Commander, I want `/student-tracker:dashboard` or "תפתח דשבורד" to open my Cycle's dashboard, so that I can see it from chat.
92. As a Commander, I want the dashboard to update live as the agent writes, so that I never refresh or republish.
93. As a Commander, I want the main page to show one circle per active Trainee with their name and days since the last Talk, colored smoothly green → red by my Talk settings and sorted reddest first, so that I see who I owe a Talk.
94. As a Commander, I want "no Talk yet" shown as the deepest red, so that a Trainee I haven't spoken to stands out.
95. As a Commander, I want an evaluation-process tag on the circle, so that Trainees in the process are visible at a glance.
96. As a Commander, I want Trainees who left shown only as one grey line below the circles, so that they don't clutter the view.
97. As a Commander, I want a color bar explaining the Talk scale, so that the colors are self-explanatory.
98. As a Commander, I want clicking a circle to open a Trainee window with the Snapshot (labelled "הערכה"), rated Skills per Stage as 1–5 squares with "+N ללא תיעוד", details (Status, evaluation process, last Talk, Project team, goals and background from public Evidence, Evidence count), and "לשיחה הבאה" (open Follow-ups word-for-word plus 2–3 suggested questions marked "הצעה"), so that I can prep a Talk from the dashboard.
99. As a Commander, I want a "לתיק המלא" button that opens the full Trainee file, so that I can go deeper.
100. As a Commander, I want the Trainee file to have a side list of Trainees grouped by Status (those who left at the end) and a way back to the circles, so that I can move between Trainees.
101. As a Commander, I want the Trainee file header to show Status, evaluation tag, a days-since-Talk chip and the Snapshot, so that context is always visible.
102. As a Commander, I want growth tiles (average across Skills with change vs 4 weeks ago, team average and sparkline; Skills that rose/fell in 4 weeks; Skill coverage), so that I see progress at a glance.
103. As a Commander, I want one small line chart per Stage (plus בין-אישי), Trainee vs team average week by week on a 1–5 scale, with hover readout and table view, so that I see growth against peers accessibly.
104. As a Commander, I want "מה זז ב-4 השבועות האחרונים" bars for Skills that rose or fell, so that recent movement is obvious.
105. As a Commander, I want improve/keep items, open Follow-ups, every Skill with its Rating square, history strip and Evidence count, and an Evidence timeline filterable by kind (with Status changes in it) in the Trainee file, so that the full record is in one place.
106. As a Commander, I want Rating marks to show Trend arrows, stale fading, a small square for Commander-set Ratings, hatching for single-Evidence Ratings, and a gray "·" for no Evidence, so that I can judge how much to trust each Rating.
107. As a Commander, I want time on every chart to run right to left (Cycle start on the right), so that it reads naturally in Hebrew.
108. As a Commander, I want the dashboard in Hebrew, RTL, following my light/dark setting, so that it's comfortable to read.
109. As a Commander, I want retracted items and sensitive details never to appear on the dashboard, so that it's safe to open in front of others.
110. As a Commander, I want the dashboard read-only with all changes made in chat, so that there is one way to change records.

### Reliability and maintenance

111. As a Commander, I want an interrupted write (crash, closed laptop) finished automatically at the start of my next command, so that records are never left half-written.
112. As a Commander, I want retries never to duplicate records, so that a flaky session doesn't double-count.
113. As a Commander, I want derived data (Trainee cards) rebuilt from the immutable records when they drift, so that the dashboard can't permanently show wrong data.
114. As a Commander, I want later plugin versions to migrate my Cycle's data via a schema version, so that updates don't break my records.
115. As a plugin maintainer, I want the marketplace repo to contain no Trainee data, so that publishing it is safe.
116. As a plugin maintainer, I want all storage access to go through one backend-neutral interface, so that a later move off the artifact database touches one layer.
117. As a plugin maintainer, I want skills to use only portable frontmatter plus a small, listed Claude-only layer, so that a later export to other agents stays cheap.

## Implementation Decisions

### Packaging and surface

- Skills-only plugin named `student-tracker` (manifest name = marketplace entry name), in one public GitHub repo with a relative-path `marketplace.json` entry, installed at user scope. No `commands/`, no hooks, no MCP servers, no agents.
- Five skills:
  - `setup` — user-only (`disable-model-invocation: true`). Never edits the current Cycle.
  - `tracker` — the one auto-triggering skill; handles all free text. Its SKILL.md is a router plus a shared preamble (connect → `resumePending`); each capability is a reference file: log, brief, status, advice, settings, playbook, retract, plus the storage interface and its artifact mapping.
  - `brief`, `status`, `dashboard` — user-only shortcuts of a few lines that hand off to `tracker` by skill name (never by file path), passing `$ARGUMENTS`.
- `tracker` description ≤1024 chars with Hebrew and English triggers from ticket 07 ("דיברתי עם", "שיחה עם", "סקד", "תרץ", "רמ"ת", "talked with", "תכין לי שיחה עם", "מה המצב", "סטטוס", "איך לעזור ל-", "תוסיף טיפ", "שנה יעד", "עזב/ה", "תפתח דשבורד", "בטל"). No Trainee names.
- Frontmatter: `name` = directory name, `description`, `metadata`, `allowed-tools`, plus Claude-only `disable-model-invocation` and `argument-hint`.
- `allowed-tools` in `tracker` lists `ArtifactData`; the build verifies whether deferred tools are honoured there. If not, the Commander approves once per session, which is acceptable.
- Plugin `version` is omitted so installs track commits; the hand-off tells the Commander how to turn on auto-update.
- Base Playbook items ship as plugin data files, each with a stable, never-reused `id`, kind, text, Skill ids or "general", optional band, origin `base`. Drafting base content is build work (agent drafts per Stage + Interpersonal group, Commander reviews each batch).
- The default Course preset ships as plugin data: Subjects in order, Tests with canonical names and aliases, Projects, a 21-week Schedule. Content is taken from the reference course structure and test catalog.
- The Skill framework ships as plugin data with stable ids per Skill (e.g. `impl.debugging`; same name in two Stages = two ids), four Stages plus the Interpersonal group.
- Hebrew is the only UI language for replies, setup and the dashboard.

### Storage (ADR 0001, ADR 0002, ticket 09)

- The Cycle's private artifact database is the only store. The machine keeps only `${CLAUDE_PLUGIN_DATA}/cycles.json` = `{current: url, archived: [url…]}`.
- One backend-neutral storage interface (a `tracker` reference file); skills call only these operations:
  - Reading: `connect`, `readCycle`, `readTeam`, `readTrainee(tid, since)`, `readPlaybook(tid, skills?)`, `readStatus`; each may name an archived `cycle` to read from
  - Recording: `recordEntry`, `recordAssessments`, `recordNextTalk`, `retractEntry`, `updateTrainee`, `updateSettings`, `updateCycle`, `takeAlert`
  - Playbook and sensitive: `savePlaybookItem`, `retirePlaybookItem`, `hidePlaybookItem`, `flipSensitive`
  - Maintenance: `rebuildCard`, `resumePending`, `copyCommanderScope(fromUrl)`, `archiveCycle(url)`, `hardDelete`
  (Operations after the first draft were added by build tickets 16, 23, 25 and 26; `storage.md` is the authority on their shapes.)
- A sibling reference file maps each operation to `ArtifactData` (paths, `if_version`, batching ≤50 writes / 1 MiB, `out_dir` for large reads). The dashboard page belongs to this backend; a backend swap replaces both.
- Collections (from ticket 09, reproduced because it is the schema):

  ```
  meta/cycle           name, start date, setup state (in-progress | done), schema (1), archived flag (+ archivedAt), previous Cycle url
  meta/alerts          which proactive alert was last shown on which day (ticket 25)
  meta/skills          Skill framework incl. added/archived Skills, stable ids
  meta/preset          this Cycle's Course preset copy
  commander/settings   name, role, Talk target + yellow/red thresholds   ┐ Commander scope,
  commander/hides      { hidden: [base item id…] }                       │ copied forward
  playbook/<id>        Commander Playbook items (edited in place)        ┘
  trainees/<tid>       Trainee card (derived cache; the page reads this)
  trainees/<tid>/evidence|assessments|followups|items|changes/<id>   immutable sources, retracted:false
  teams/<id>           Project teams
  entries/<eid>        raw Entries (page never reads)
  sensitive/<id>       sensitive Evidence + Follow-ups / items quoting it (page never reads)
  ```

- Trainee card holds: display name, active/left (+date, reason), Status, evaluation stage, last Talk date, Snapshot `{text, at}`, display-safe active improve/keep items and open Follow-ups, `nextTalk: {questions, at}`, and per Skill the counting Assessments `[[date, score, author], …]` plus Evidence count `n`. Rating, Trend and stale are computed at read time, never stored.
- Write protocol: Entry written with `status: writing` and its touched Trainees → one chunk per Trainee (new records + card update, pinned by `if_version`) → Entry `status: done`. Child ids are deterministic (`<entryId>-<n>`) so retried creates are refused. Every `tracker` run starts with `resumePending`. A card version conflict = re-read sources and `rebuildCard`. Retraction uses the same chunked protocol, marked `retraction: writing | done`.
- Retraction sets `retracted: {at}` on the Entry and flips `retracted` to `true` on every child; queries filter on `retracted == false` explicitly.
- `flipSensitive` moves a document between `sensitive/` and the Trainee's `evidence/` in one pinned batch, same id.
- Ids: Entries `e-YYYYMMDD-HHMM-<rand2>`; children `<entryId>-<n>`; Trainees `t-<rand6>` (never a name); standalone re-rate Assessments `a-YYYYMMDD-HHMM-<rand2>` with `entry: null`. Evidence has `date` (when it happened); every record has `at` (ISO with offset).
- Session loading: team questions read `readCycle` + `readTeam`; brief or Trainee questions add `readTrainee(tid, since: 6 weeks)`, widening only when asked.

### Domain rules (tickets 03, 05)

- Rating rule (must be identical in agent instructions and page code):

  ```
  counting(Trainee × Skill) = Assessments not retracted, author ∈ {agent, Commander}
  Rating = latest Commander Assessment if any Commander Assessment exists
           else latest agent Assessment
           else unrated
  Trend  = Rating now vs Rating as of (today − 28 days): ↑ / ↓ / none (none if unrated then)
  stale  = latest counting Assessment older than 42 days
  ```

- Assessments are whole numbers 1–5, immutable, dated, with author, reason and ≥1 Evidence id. Written without confirmation.
- Self-assessment gap ≥2 → agent Assessment on מודעות עצמית citing the form and gap direction.
- Playbook level bands: low 1–2, mid 3, high 4–5; unrated Skills get only untagged items.
- Sensitive categories: health (physical or mental), family, distress or crisis, finances, romantic relationships, discipline/legal. The evaluation process is not sensitive by default.
- Advice build: target lowest/declining (↓) Skills plus requested focus → band-fitting items → Commander items before base → skip items the Evidence shows were tried without effect → rewrite to the Trainee's Evidence with citations → max 2–3. `nextTalk` is rewritten in the same chunk as any card update for that Trainee.

### Setup (ticket 06)

- Order: preflight (`Artifact` present, ToolSearch finds `ArtifactData`) → existing-Cycle lookup (pointer, else `Artifact list` by title prefix "מעקב חניכים ·") → one batched question → confirmation summary → publish private HTML page with `db` + `user` capabilities and `pin: true` → write pointer → seed with `meta/cycle.setup = in-progress` … `done` → hand-off.
- Found-and-in-progress resumes seeding; never publishes a second artifact.

### Cycle lifecycle (closes the map's fog; agent-decided, veto any)

- "New Cycle" from setup: confirm, publish and seed the new artifact, then `copyCommanderScope(previous url)`, then move the previous URL into `archived` in the pointer and set `meta/cycle.archived = true` in the old database.
- The dashboard page shows a read-only "מחזור בארכיון" banner when `archived` is true. Archived artifacts are read-only by convention: `tracker` refuses writes to an archived Cycle and points to the current one.
- The old artifact is not deleted. Setup offers once to unpin it; it is unpinned only on a yes.
- The Commander can ask about an archived Cycle in chat ("מה היה עם דני במחזור הקודם?"); `tracker` reads it via the pointer's `archived` list.

### Course preset (closes the map's fog; agent-decided, veto any)

- The shipped preset is the reference Fullstack structure and test catalog as-is (Subjects, Tests + aliases, Projects Interpreter / Padens / MZ, 21-week Schedule). Each Cycle stores its own copy in `meta/preset`; setup and later chat edits change only that copy, confirmed first.

### Install path without git (closes the map's fog; agent-decided, veto any)

- v1 requires `git` for marketplace install. The repo README states this up front with a one-line install hint per OS. No alternative install path in v1.

### Portability (closes the map's fog; agent-decided, veto any)

- Prompts (SKILL.md bodies and reference files) stay agent-neutral: they name storage operations, not `ArtifactData` calls; only the artifact mapping file, setup's preflight/publish steps, the dashboard page and the shortcut frontmatter mention Claude-only features.
- Claude-only layer, listed in the repo README: invocation flags, `${CLAUDE_PLUGIN_*}`, the Artifact/ArtifactData tools, the dashboard page.

### Dashboard page (ticket 08)

- One private plain-HTML page, Hebrew RTL, theme from the viewer's setting (no toggle). Reads live via `db` subscriptions: `trainees`, `meta/*`, `commander/settings`, `teams`, and per-Trainee subcollections when a Trainee file opens. Never reads `entries` or `sensitive`; filters `retracted == false`; shows "[פרט אישי — בתיק]" for any id it can't resolve.
- The page has one pure derivation module used by every view: Rating/Trend/stale from a card's Assessment list, week-end replay for growth lines (mean of rated Skills per Stage and overall; team = mean of active Trainees including the Trainee), 4-week movers, and Talk-circle color.
- Talk-circle color is anchored on Commander settings: green at 0 days, lime at the target, amber at the yellow threshold, red at threshold + 7, deep red from threshold + 14; no Talk yet = deepest red.
- Chart colors: Trainee blue, team gray, decline red; Rating squares dark red (1) → vibrant green (5), gray "·" unrated. Status labels במסלול / במעקב / דורש טיפול; agent text labelled הערכה / הצעה.
- No test-score chart, no team-wide grid or stats, no Playbook view.
- Build from the resolved prototype (variant D main page + variant C Trainee file with growth section).

### Chat replies

- Confirmation line per ticket 05: per Trainee, what was recorded; one line per Assessment (`דיבאג 2→3 (הערכה): <reason> — <Evidence kind + date>`, `תקשורת: נשאר 3 (הערכה)`, `—→3` for a first Rating, `(הצעה) מציע לעדכן …` against a Commander value); new Follow-ups; ends with "לביטול: 'בטל'". No Advice on the confirmation line.
- Brief, team status, proactive alerts and the Retraction reply follow the content lists in the user stories above; exact layout is set by ticket 10's resolved samples (`issues/10-chat-output-formats.md`).

## Testing Decisions

### What makes a good test

- Tests exercise external behaviour only: a Commander message in → database state and reply out; a database fixture in → what the dashboard shows. They never assert on which reference file was read, on intermediate tool calls, or on prompt wording.
- Agent-behaviour tests assert on stored structure and invariants (which Trainees got Evidence, kinds, word-for-word excerpts, sensitive placement, `retracted` flags, Assessment authors and counting, card consistency with sources), not on free-text phrasing. Reply checks are limited to required markers ("לביטול: 'בטל'", "(הצעה)", "[פרט אישי — בתיק]") and to absence of sensitive text.

### Seams (agent-decided, veto any)

1. **Storage interface seam (primary).** The backend-neutral storage interface from ADR 0001 doubles as the test seam. A test backend (local JSON files under a temp dir, selected by the pointer file) implements the same operations. Plugin evals (`claude plugin eval`) drive `setup` and `tracker` with scripted Commander messages and assert on the resulting store via `readCycle` / `readTeam` / `readTrainee`. This covers setup, logging, splitting, sensitive handling, Retraction, Rating rules, overrides, roster/settings confirmation, Playbook saves, `resumePending` (by seeding a `writing` Entry) and `rebuildCard`. Needed because artifacts are off by default in non-interactive modes, so evals can't rely on the real artifact backend.
2. **Dashboard derivation seam.** The page's pure derivation module is tested with card fixtures: Rating / Trend / stale at a given "today", Commander-override stickiness, retracted filtering, growth-line replay, 4-week movers, circle-color anchors. This module and the agent's Rating rule are the one place the rule is duplicated, so a shared fixture table (Assessment lists → expected Rating, Trend, stale) is used by both the derivation tests and a Rating eval.

The `ArtifactData` mapping file is verified by a short manual smoke checklist against a real private artifact (publish, seed, record an Entry, interrupt and resume, retract, flip sensitive, copy Commander scope into a second artifact, archive), not by automated tests.

### Modules tested

- `setup` and `tracker` skills via evals on the storage seam.
- Dashboard derivation module via unit tests on fixtures.
- Shipped data files (Skill framework, preset, base Playbook) via a schema/consistency check: unique stable ids, every Playbook item tagged to an existing Skill id or "general", aliases unique within the preset.

### Prior art

- No code exists yet. The dashboard prototype (`.scratch/student-tracker/prototypes/dashboard-prototype.html`) has `ratingAt` and `talkColor`, which are the starting point for the derivation module and its fixtures.
- The reference skill's message-splitting rules and test catalog give realistic Hebrew eval inputs.

## Out of Scope

- Writing updates from the phone (viewing the dashboard through claude.ai is incidental).
- Exporting to Codex CLI, Gemini CLI, Cursor, Copilot CLI, OpenCode; only the portability layering above is in scope.
- Sharing between Commanders or aggregating across Commanders; one private instance per Commander.
- Non-Claude storage backends (beyond the local test backend).
- A git-free install path.
- Hooks, scheduled jobs or background alerts; alerts ride on `tracker` replies.
- Editing records from the dashboard; it is read-only.
- Team-wide views on the dashboard (Skill grid, team stats, recent-Evidence feed), test-score charts and any Playbook view on the dashboard.
- Rating decay or scheduled recomputes.
- Authoring the base Playbook content itself (separate build task with Commander review per Stage).

## Further Notes

- **Open dependency:** ticket 10 ("What do the tracker's chat replies look like?") is still open. It blocks only the final layout of brief, team status, alert and Retraction replies; everything else can be built now. The confirmation-line format is already fixed by ticket 05.
- **Unknowns from research:** the minimum Claude Code version for `ArtifactData` (first changelog mention 2.1.268), numeric DB quotas and rate limits, retention on Pro/Max, and whether `allowed-tools` honours deferred tools. Setup's preflight protects against the first; the 4–5k document estimate leaves headroom on the second.
- **Privacy:** on Team/Enterprise plans org Owners can reach artifacts through the Compliance API. The README should say so plainly.
- The Rating rule lives in two places (agent instructions, page code); the shared fixture table is the guard against drift.
- Every "agent-decided (veto any)" decision above can be overturned by the Commander without touching the rest of the spec.
