# 11: Walking skeleton — install, minimal setup, log one Talk

**Spec:** `.scratch/student-tracker/spec.md` (Packaging and surface; Storage; Testing Decisions → seam 1)

**What to build:** The thinnest end-to-end path through the plugin. A Commander installs `student-tracker` from the local repo as a marketplace, runs a minimal `/student-tracker:setup` (Commander name, Cycle name, Trainee first names), and then writes "דיברתי היום עם נועה, …" in chat. The message is kept whole as an Entry, a Talk Evidence is cut from it for that Trainee, and the Trainee card's last Talk date is updated. Everything runs against the local JSON test backend behind the backend-neutral storage interface, and a plugin eval proves it.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The project folder is a git repo; the plugin manifest and a relative-path marketplace entry both use the name `student-tracker`, and `/plugin marketplace add <local path>` + `/plugin install` work
- [x] Skills `setup` (user-only) and `tracker` (auto-triggering, router + references) exist with portable frontmatter
- [x] The Skill framework ships as a plugin data file with stable Skill ids (four Stages + Interpersonal group; same name in two Stages = two ids)
- [x] The storage interface reference defines every operation named in the spec; this ticket implements `connect`, `readCycle`, `readTeam`, `readTrainee` and a minimal `recordEntry` on the local test backend
- [x] The local test backend is selected by the pointer file and stores the spec's collection layout as JSON files
- [x] Minimal setup seeds `meta/cycle`, `meta/skills`, `commander/settings` (default Talk thresholds) and one Trainee card per name (ids `t-<rand6>`, never a name)
- [x] Logging a Talk writes the raw Entry word-for-word, one Talk Evidence with its word-for-word excerpt, `date`, `at` and `retracted: false`, and the card's last Talk date
- [x] An eval harness runs `setup` + one Talk message against the local backend and asserts on stored state through the storage interface reads
- [x] The confirmation reply ends with "לביטול: 'בטל'" (Retraction itself is ticket 17)

## Comments

**2026-10-30 — implemented** (plugin at `plugins/student-tracker/`, marketplace at `.claude-plugin/marketplace.json`).

- Verified: `claude plugin marketplace add <repo path>` + `claude plugin install student-tracker@student-tracker` in an isolated `CLAUDE_CONFIG_DIR`; `claude plugin validate` reports only the missing icon and the intentionally omitted `version`.
- Tests: `npm test` (store ops, CLI, Skill framework consistency). Eval: `npm run eval` (real model calls) passed: setup summary → "כן" → hand-off, then a free-text Talk auto-triggers `tracker`; asserts via `readCycle` / `readTeam` / `readTrainee`.

Deviations from the spec, for the next tickets to know:
1. **Eval harness is `node --test` driving `claude -p`, not `claude plugin eval`.** `claude plugin eval` has no script graders (no way to assert through the storage reads), no multi-turn cases, and doesn't document `${CLAUDE_PLUGIN_DATA}` inside runs. The harness resumes the setup session (`--resume`) for the confirmation turn.
2. **Test backend selection:** the `STUDENT_TRACKER_DATA` env var (inherited by the Bash tool) points the store command at a throwaway data dir holding its own `cycles.json`. The Commander's real pointer is never touched.
3. **Local backend is a Node CLI (`bin/student-tracker-store`) with plain-text payloads, not JSON.** Claude Code's Bash safety check refuses `{"` in a command ("Contains brace with quote character (expansion obfuscation)"), even for an allowlisted prefix. The artifact backend (ticket 13) passes JSON as tool parameters, so this is local-only.
4. **`createCycle` added to the storage interface** for setup's seed step (resumes an interrupted seed, refuses over a finished Cycle).
5. **`${CLAUDE_PLUGIN_DATA}` appears in the `tracker` and `setup` SKILL.md bodies.** Substitution only happens in SKILL.md, so the data dir can't live in a reference file. One line each.
6. Until ticket 14, `tracker` logs only Talks; an Entry needs ≥1 Evidence, so a message with no Talk is not recorded (the reply says so).
7. `allowed-tools` lists `Bash(student-tracker-store *)`; the `ArtifactData` entry is ticket 13.
