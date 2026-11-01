# Which slash commands and auto-triggered skills does the plugin expose?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: raymandelvei (claimed 2026-10-29)
Blocked by: 02

## Question

Decide the Commander-facing surface: which capabilities get an explicit command (setup, log update, pre-Talk brief, team status, open dashboard, advice for a Trainee/Skill, add Playbook tip?) and which are a skill that triggers on free-text messages; command names in the `student-tracker:` namespace; Hebrew trigger phrases; and how the surface stays portable for a later export. Constrained by "How is a Claude Code plugin packaged, namespaced, configured and distributed?" (02).

Per "What does `/student-tracker:setup` ask, and what does it create?" (06): setup is user-only (`disable-model-invocation: true`) and never edits the current Cycle, so settings changes ("שנה יעד שיחות ל-7", "נועה עזבה") need a home in the normal-chat surface. Every non-setup skill starts with the same silent pointer lookup: read `${CLAUDE_PLUGIN_DATA}/cycles.json`, else `Artifact list` by the "מעקב חניכים ·" title prefix; one match connects, several ask, none points to setup.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, one round of two questions plus six agent-decided points, all accepted). New term **Retraction** is in `GLOSSARY.md`.

**Surface**

| Skill (directory) | Command | Who invokes | Does |
|---|---|---|---|
| `setup` | `/student-tracker:setup` | Commander only (`disable-model-invocation: true`) | Per "What does `/student-tracker:setup` ask, and what does it create?" (06) |
| `tracker` | `/student-tracker:tracker` | Auto-triggers on free text; also typeable | Everything operational (see below) |
| `brief` | `/student-tracker:brief <חניך>` | Commander only | "use the tracker skill in brief mode for `$ARGUMENTS`" |
| `status` | `/student-tracker:status` | Commander only | same, team-status mode |
| `dashboard` | `/student-tracker:dashboard` | Commander only | same, opens the Cycle's artifact (`Artifact open`) |

**Decided with the Commander**
- Free text is the main way in. Three slash shortcuts (brief, status, dashboard) exist for discoverability in `/` autocomplete. Each is a few lines that hand off to `tracker`.
- **Evidence is written without asking first** when a message clearly reads as an update about a known Trainee. The confirmation line ends with "לביטול: 'בטל'". The agent asks first only when the message is ambiguous: an unknown name, a duplicate first name, or text that might be a question rather than an update.
- **"בטל" makes a Retraction.** It covers the last Entry, or an Entry the Commander names. That Entry's Evidence, Assessments, Follow-ups and improve/keep items stop counting and stop showing, but stay stored. "Never edited" still holds.

**Agent-decided (veto any)**
1. **One auto-triggering skill, `tracker`.** It covers logging Entries, pre-Talk briefs, team status ("מה המצב"), Advice for a Trainee or Skill, roster and settings changes, adding Playbook tips, opening the dashboard, and retractions. Each capability is one file under `skills/tracker/references/` (e.g. `log.md`, `brief.md`, `status.md`, `advice.md`, `settings.md`, `playbook.md`, `retract.md`). The SKILL.md body is a router plus the shared preamble: the silent pointer lookup from 06. One skill means no misrouting between overlapping skills, e.g. "מה המצב עם נועה" is a brief, not team status.
2. **The `tracker` description is ≤1024 chars**, with Hebrew and English triggers taken from the reference skill: "דיברתי עם", "שיחה עם", "סקד", "תרץ", "רמ"ת", "talked with", "תכין לי שיחה עם X", "מה המצב" / "סטטוס", "איך לעזור ל-X עם…", "תוסיף טיפ", "שנה יעד", "X עזב/ה", "תפתח דשבורד", "בטל". Trainee names can't be in it, because the description is static.
3. **Roster and settings changes are confirmed before they apply**: adding a Trainee, a Trainee leaving (Active → Left), Talk thresholds, Commander name or role, Status override, Evaluation-process stage, Course preset edits, Project teams. They are rare and carry weight. Evidence and agent Assessments are not confirmed: Q2 above, and "How does the agent turn Evidence into a 1–5 Rating?" (05).
4. **No hooks in v1.** A shell hook can't call `ArtifactData`, so proactive alerts (overdue Talks, repeated patterns) ride on `tracker`'s replies. Their format stays in the "Output formats" fog.
5. **Portability:** skills only, no `commands/`. Frontmatter is the portable set (`name`, `description`, `metadata`, `allowed-tools`) plus the Claude-only `disable-model-invocation` and `argument-hint`. Directory names are short for nice Claude Code commands, and the later export adds a `student-tracker-` prefix, since other agents don't namespace. The shortcuts route to `tracker` by name, not by a cross-skill file path.
6. `allowed-tools` pre-approves `ArtifactData` reads in `tracker`, if the field supports MCP-style deferred tools. Otherwise the Commander approves once per session. The spec settles which.

Knock-on effects recorded on other tickets: the storage mapping must hold a Retraction mark on an Entry and everything cut from it. The dashboard hides retracted items.
