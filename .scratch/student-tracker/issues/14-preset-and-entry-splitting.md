# 14: Course preset and full Entry splitting

**Spec:** `.scratch/student-tracker/spec.md` (Course preset; Logging updates stories); ticket 03

**What to build:** Any realistic Commander update is recorded correctly. One message about several Trainees becomes one Evidence per Trainee, each with its own word-for-word excerpt; a team-wide sentence becomes one Evidence per Trainee on the same Entry. All Evidence kinds are classified, relative dates resolved, Test names matched to the Cycle's Course preset (aliases, Schedule for ambiguous "תרץ 1"), Follow-ups opened and closed, and corrections recorded as clarifications. Ambiguous messages get a short question instead of a guess.

**Blocked by:** 11

**Status:** resolved

- [x] The default Course preset ships as plugin data (Subjects in order, Tests with canonical names + aliases, Projects, 21-week Schedule) from the reference course and test catalog; setup copies it to `meta/preset`
- [x] All 11 Evidence kinds with their kind-specific fields (test: subject, Test, score or null, `self`; code review: related Test; project observation: Project team; Talk: topics + Follow-ups opened/closed)
- [x] Multi-Trainee and team-wide splits; a mention of another Trainee creates Evidence for them only when the text says something about them
- [x] "אתמול" / "ביום שני" resolve to the actual date; unstated = today
- [x] Unknown Test recorded as written, flagged, added to the preset copy only after confirmation
- [x] Unknown name, or text that might be a question → ask before recording anything
- [x] Scores are recorded only when given
- [x] Follow-ups are created from any Evidence and closed by a later Evidence; open ones appear on the card
- [x] A correction becomes a clarification Evidence linked to the original; nothing is edited
- [x] Evals with realistic Hebrew messages cover each bullet above

## Comments

**2026-10-30 — implemented** (`data/preset.json`, `lib/store.mjs`, `lib/payload.mjs`, `skills/tracker/references/{log,storage,storage-local,storage-artifact}.md`, `evals/splitting.eval.mjs`).

- **Preset:** `data/preset.json` = the reference Subjects in order, 21 Tests (canonical name, `number`, aliases), Projects Interpreter / Padens / MZ, and a 21-week Schedule. Setup seeds it into `meta/preset` (local backend and artifact mapping). Data test: ids unique, every reference resolves, no name or alias shared by two Tests.
- **Evidence fields per kind** (storage.md table): test `subject`, `test`, `unlisted`, `score`, `self`; code review `subject`, `test`, `unlisted`; project observation `project`; clarification `clarifies` (required, must name that Trainee's Evidence); Talk `topics`; every kind `closes`. Absent fields are stored at their default (`score: null`), so "no score given" is explicit. A field that doesn't belong to the kind is refused.
- **Test names:** the agent resolves aliases and "תרץ N" (Schedule week = whole weeks from the Cycle start + 1); the store only checks: a non-canonical `test` is refused with the canonical name when it is an alias, and otherwise must carry `unlisted: true`. A listed Test's `subject` is stored from the preset. Resolution stays agent-side on purpose so the artifact backend (no code) behaves the same as the local test backend.
- **Follow-ups:** opened by any Evidence (`followups: [text]`, word-for-word) as records in `trainees/<tid>/followups/<eid>-<n>` (numbered after the Entry's Evidence); closed by a later Evidence listing the id in `closes` (checked against the card's open Follow-ups on both backends). Open = not retracted and not closed by a non-retracted Evidence, so a Retraction (ticket 17) reopens/removes them with no extra logic. The card holds open ones as `{id, text, date}`.
- **Unknown Test:** recorded as written with `unlisted: true`, the reply asks once; on a yes `updateCycle({addTest})` appends it to `meta/preset.tests` (refuses unknown Subject or a taken name/alias).
- **CLI payload:** kind fields moved from header `key=value` to `+key: value` lines under the Evidence header (values can now hold spaces, e.g. "Papi's Park"); `--- followup` blocks; new `update-cycle`. A blank or non-numeric `+score:` is refused, never stored as 0.
- **Evals:** `evals/harness.mjs` now shared; evals run with `--test-concurrency=1` (they share the inline data dir). `splitting.eval.mjs` (9 tests): team-wide + per-Trainee split in one Entry; alias + Schedule + score/self + "אתמול"/"ביום שני"; every Evidence kind incl. code review → Test; unknown Test flagged then added after "כן"; unknown name and possible question record nothing; ambiguous "תרץ 1" (week 4) and a shared first name ask and record nothing; Follow-up closed and another opened, with a mentioned Trainee getting no Evidence; correction → linked clarification. Reply checks are limited to the Retraction marker, per the spec's testing rules.

Deviations / open points (agent-decided, veto any):
1. **The 21-week Schedule is drafted**, not copied: the reference gives only the order and overlaps of Subjects. Weeks: תבי 1–5, OOP 4–8 (Interpreter 6–7), DB 6–8, Frontend + Backend 9–12 (Padens 10–12, Deployment 10–12), Express + JS/TS 13–15, React 16–19, MZ 20–21. The Commander should check it (ticket 20's "תואם לקורס שלך?" lets each Cycle fix its copy).
2. Added Subject aliases (תבי, מסדי נתונים, ספרינג…) and Project aliases (פאדנס…) beyond the catalog, to help matching.
3. `updateCycle` supports only `addTest` for now; the rest is ticket 18.
4. Cycles set up before this ticket (the ticket 13 test artifact) have no `meta/preset`, so every named Test there is refused as unlisted. Not migrated: there are no real Cycles yet; a fresh setup fixes it.
