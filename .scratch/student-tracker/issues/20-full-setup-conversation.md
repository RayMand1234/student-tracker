# 20: Full setup conversation

**Spec:** `.scratch/student-tracker/spec.md` (Install and setup stories 4–16; Setup); ticket 06

**What to build:** The complete first-run experience. After preflight and the existing-Cycle lookup, setup sends one batched Hebrew question with defaults inline (mandatory: Commander name, Cycle name/color; defaulted: role, Talk target 10 / yellow 10 / red 14, start date today, shipped Course preset; optional: Trainee names and info, Project teams, extra Skills). The preset is shown as a 3–4 line summary ("תואם לקורס שלך?") and free-text differences are applied to this Cycle's copy. A confirmation summary precedes any creation, then a Hebrew hand-off with the dashboard link, three starter phrases and an auto-update hint.

**Blocked by:** 13, 14, 15

**Status:** resolved

- [x] Partial answers accepted; only the two mandatory fields block progress
- [x] Preset differences applied to `meta/preset` and echoed back as a change list
- [x] Extra Trainee info given at setup is recorded as ordinary Entries (split, sensitive flagged)
- [x] Duplicate first names get labels at setup
- [x] "זה מה שאקים — לאשר?" summary plus a warning about the one-time publish permission; nothing created before yes
- [x] Found-and-`done` Cycle: "להתחבר למחזור <name>, או להתחיל מחזור חדש?"; connect writes the pointer and stops
- [x] Found-and-`in-progress`: resume seeding into that artifact and re-show the summary; never publish a second one
- [x] Hand-off lists what was created, the link, "דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב", and the `/plugin` → Marketplaces auto-update line

## Comments

**2026-10-30 — implemented** (`skills/setup/SKILL.md`, `lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/references/{storage,storage-local,storage-artifact,roster}.md`, `test/{store,roster,cli}.test.mjs`, `evals/setup.eval.mjs`, `evals/harness.mjs`).

Decisions taken while building (agent-decided, veto any):

- **`createCycle` no longer finishes setup.** It seeds and leaves `setup: in-progress`; setup then applies the Course preset changes, extra Skills and Project teams (`updateCycle`) and the Trainee info (`recordEntry`), and ends with the new **`finishSetup`** (idempotent). An interruption anywhere before it is resumed, never left as a half-seeded "done" Cycle. Evals that seed a store directly now call `finishSetup`.
- **Resume keeps what was stored.** A second `createCycle` on an `in-progress` Cycle creates `meta/skills` and `meta/preset` only if missing (so changes setup already made stay), keeps the stored start date, role and Talk values unless given again, and applies the names given (so a change at the re-shown summary takes effect). Both backends now say the same.
- **`createCycle` takes `role`, `start` and Talk `target / yellow / red`**, checked by the same rule as `updateSettings` (shared `talkSettings`). CLI `create-cycle` accepts `role:`, `start:`, `target:`, `yellow:`, `red:`; new `finish-setup`.
- **Two new preset changes** so common course differences can be expressed: `removeProject` (by id, name or alias; out of `projects` and the Schedule; refused while it has a Project team) and `removeWeek` (only the last week: a shorter course). Also offered in chat via `roster.md`. Renaming a Subject or Project is still not expressible: setup says so and goes on.
- **Talk cadence answer**: "כל שבוע" = target 7; a target past 10 moves yellow to the target and red to target + 4 (shown in the summary), since the store refuses a target past yellow.
- **Setup Entry**: the Commander's whole answer message is the Entry text; per-Trainee Evidence cut by `log.md`, sensitive parts flagged, dated today unless stated.
- **Arguments path**: when `$ARGUMENTS` give the name and Cycle, the batched question is skipped and the summary carries the preset summary in its course bullet with "אם משהו בקורס שלך שונה…".
- **Found-and-done**: setup asks "להתחבר למחזור <name>, או להתחיל מחזור חדש?" whether the Cycle came from the pointer or the lookup. Connect: "מחובר למחזור…" and stop. New Cycle: "עוד לא נתמכת בגרסה הזו" (ticket 26). Note `connect` saves a looked-up pointer before the Commander answers; harmless until ticket 26 adds the new-Cycle path.
- **Local lookup**: the local backend's `connect`, with no `current` in the pointer, adopts the one store under `<data dir>/local/` (archived skipped; several refused with their names). It mirrors the artifact title lookup so found-and-done is evaluable; the eval harness clears `local/` before each test.

Not done / to raise:

- The artifact path (publish, pointer, seed over `ArtifactData`) is still unverified against a real artifact: ticket 28.
- "תכין לי שיחה עם נועה" and "מה המצב" in the hand-off route to "עוד לא נתמך" until ticket 25.

Tests: 159 unit tests. Evals (`evals/setup.eval.mjs`): the batched question with the preset summary, a missing Cycle asked for alone, course differences + role + cadence + Trainee info (sensitive cut) applied only on yes, hand-off phrases; namesake labels; found-and-done connect; interrupted setup resumed into the same store. `logging.eval.mjs` (setup by arguments) still passes.
