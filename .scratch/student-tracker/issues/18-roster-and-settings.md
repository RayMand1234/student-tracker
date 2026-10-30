# 18: Roster and settings changes

**Spec:** `.scratch/student-tracker/spec.md` (Trainee state stories 69, 73–75; Domain rules); ticket 07 decision 3

**What to build:** The Commander changes the roster and settings in chat, with a confirmation before each change applies: adding a Trainee (with a label for a duplicate first name), a Trainee leaving (date, reason; drops out of team views, records kept read-only), Talk target and thresholds, Commander name or role, Course preset edits, Project teams, and Skills added to a Stage or the Interpersonal group (archived, never deleted). The agent proposes a new Skill when a theme recurs 3+ times.

**Blocked by:** 14

**Status:** resolved

- [x] Each change is summarized and applied only on confirmation, via `updateTrainee`, `updateSettings`, `updateCycle`
- [x] Duplicate first names get a short distinguishing label used as the display name; a bare "נועה" then triggers a which-one question
- [x] A Trainee who left is excluded from team views and refuses new Evidence unless the Commander insists
- [x] Talk-threshold changes move the dashboard circle colours (ticket 13) on the next render
- [x] Project teams stored in `teams`; project observations link to their team
- [x] Added Skills get stable ids; archived Skills keep their Assessments; a recurring theme (3+) triggers a proposal
- [x] Evals cover confirm/decline for each change kind

## Comments

**2026-10-30 — implemented** (`lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/SKILL.md`, `skills/tracker/references/{roster,log,storage,storage-local,storage-artifact}.md`, `test/roster.test.mjs`, `test/cli.test.mjs`, `evals/roster.eval.mjs`).

Decisions taken while building (agent-decided, veto any):

- **`updateTrainee(tid?, change)`** takes exactly one of `add {name}` (no tid), `rename {name}`, `leave {date, how, reason}`, `rejoin {}`. Each writes a `changes` record (`c-YYYYMMDD-HHMM-<rand2>`; the first stays `added`) plus the rebuilt card in one pinned batch. The card's `name`, `active` and `left {date, how, reason}` are derived from the live changes, so `rebuildCard` restores them. `rename` is how a label is given; `rejoin` exists because roster changes aren't Entries and "בטל" can't undo a mistaken leave. Status and evaluation stage stay for ticket 19.
- **Name clash rule** (store, setup included): two display names clash when equal ignoring case and spacing, or when one is a bare first name the other starts with ("נועה" vs "נועה כ."). So the store itself forces a label on both namesakes; the agent asks for the labels (an initial is enough) and does relabel + add under one confirmation.
- **Left Trainees** refuse new Evidence (`recordEntry`) and Assessments (`recordAssessments`) unless `insist` (CLI `--insist`); insisting doesn't bring them back. `readTeam` still returns them (`active: false`); team views count active Trainees only; the dashboard already showed them as the grey line. A leave date can't be in the future; the reason is display-safe (the card shows it).
- **`updateSettings`** merges `name`, `role` (`null` clears) and `talk {target, yellow, red}`; refuses non-whole or <1 day values, `yellow ≥ red` and `target > yellow`. The page subscribes to `commander/settings`, so circles re-colour live.
- **`updateCycle`** takes one change per call: preset `addTest`, `editTest` (a rename keeps the old name as an alias), `removeTest` (this Cycle's catalog only; recorded Evidence keeps its words), `addProject`, `setWeek`; Skills `addSkill` (`<group>.c-<rand4>`, `added: at`), `archiveSkill` / `restoreSkill` (archived Skills keep counting on the card but take no new Assessment; the refusal says to restore); teams `setTeam {id?, project, name, members}` → `teams/tm-<rand4>`, one team per Trainee per Project.
- **Project observations** get `team` filled by storage from `teams` (never given by the agent); `readCycle` now returns `teams`.
- **Confirmation flow** in the new `roster.md`: a one-or-two-line summary ending "לאשר? (כן / לא)", applied only on a clear yes, "עודכן: …" after; no Retraction line. A mixed message logs the update and asks about the roster change in the same reply.
- **New-Skill proposal**: logging step 10 — a theme no Skill names itself, seen in 3+ Evidence, gets one "(הצעה) … להוסיף מיומנות …? (כן / לא)" line; a Skill you'd stretch to fit doesn't count as covering it.

Not done / to raise:

- The Commander's **red** threshold is stored and validated but the dashboard anchors red on yellow + 7 (ticket 13 reading of the spec's "red at threshold + 7"). So "אדום אחרי 12 יום" doesn't move the circles; it will matter for overdue alerts (ticket 25). Worth a Commander call.
- `setTeam`'s one-team-per-Project check reads all teams but can't pin them all, so two concurrent sessions could both place one Trainee; acceptable for one Commander.

Tests: 148 unit tests (roster store ops, CLI payloads). Evals (`evals/roster.eval.mjs`): confirm and decline for add, duplicate name + which-one, leave + insist, Talk target, role, Test alias, Project team + observation link, add Skill, archive Skill, and the Skill proposal yes/no.
