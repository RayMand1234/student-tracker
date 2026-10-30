# 19: Trainee state — Status, evaluation process, Snapshot, improve/keep

**Spec:** `.scratch/student-tracker/spec.md` (Trainee state stories 66–68, 70–72); ticket 03 decisions 7, 13

**What to build:** Each Trainee carries a current standing the Commander can trust. The agent proposes Status (במסלול / במעקב / דורש טיפול) with a reason; the Commander can override, and every change is a Status change record. The evaluation-process stage moves only on the Commander's word, recorded as Evidence and a stage-change record. The agent keeps a short Snapshot labelled as an assessment, regenerated as Evidence arrives, and manages improve/keep items (Commander's word-for-word, agent's "(הצעה)", active → retired).

**Blocked by:** 16

**Status:** resolved

- [x] Status proposals carry a reason; a Commander override is confirmed first; every change writes a change record (from → to, when, by whom, why, Evidence)
- [x] Evaluation-process stage (רף מקס → רף רמד → רף מפקד היחידה → הדחה) never changes without the Commander
- [x] Snapshot `{text, at}` on the card, rewritten in the same chunk as other card updates, display-safe
- [x] Improve/keep items with origin Evidence and lifecycle; the card holds only active ones
- [x] Evals: agent never escalates the evaluation process on its own; Status override sticks

## Comments

**2026-10-30 — implemented** (`lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/SKILL.md`, `skills/tracker/references/{state,log,roster,retract,storage,storage-local,storage-artifact}.md`, `test/state.test.mjs`, `test/cli.test.mjs`, `evals/state.eval.mjs`). Built on branch `ticket-19-trainee-state` in a separate worktree, because another session was editing the same files for ticket 20 in the main tree.

Decisions taken while building (agent-decided, veto any):

- **Everything is a record; the card is derived.** Status, evaluation stage, Snapshot and item retirements are `changes` records (`type: status | stage | snapshot | retired`); improve/keep items are `items` records. The card takes the latest live one of each type (by `at`, then id). The Snapshot is a record, not a carried-over cache, so `rebuildCard` and Retraction restore the one before. Only `nextTalk` still carries over.
- **Status** values `good | watch | concern` (במסלול / במעקב / דורש טיפול). The card's `status` is `{value, by, reason, at}`. The agent's Status goes with the Entry in `recordEntry` (`changes`), written without asking; the Commander's goes through `updateTrainee({status: {to, reason, evidence?}})` after they confirm (an override or an accepted "(הצעה) מציע לשנות סטטוס"). Once the Commander has set it, the store refuses agent Status changes for that Trainee, so the override sticks; the agent proposes instead. A Commander Status may cite no Evidence (a pure judgement call).
- **Evaluation stage** (`רף מקס`, `רף רמד`, `רף מפקד היחידה`, `הדחה`, or `null` = out of the process) is stored as its Hebrew name (the dashboard already shows `evalStage` as is). It changes only through `recordEntry`, after the Commander confirms, and must cite an `evaluation-event` Evidence of the same Entry (the Commander's words), with `by: commander`. So "בטל" withdraws the Evidence and the stage together. The agent never proposes entering or moving the process. `הדחה` as a stage doesn't mark the Trainee as left; that stays a separate roster change.
- **Improve/keep items** `{kind: improve | keep, text, by, from, date}`: the Commander's are word-for-word and may not quote a sensitive part unless taken from it; an item taken from a sensitive part lives in `sensitive/` (`record: "item"`) and shows on the card as the marker; `flipSensitive` moves items with their Evidence. The agent adds at most one of its own per Trainee per Entry ("(הצעה)" in replies), retires only its own, and retires a Commander item only on the Commander's word.
- **Display-safety in the store:** a reason (Assessments included), Snapshot or agent item text that repeats a sensitive part of the Entry (three of its words in a row, punctuation aside, that the Entry has nowhere outside a sensitive part) is refused. This came out of the review.
- State changes and items go only with a Trainee the Entry has Evidence about; one change of each type per Trainee per Entry.
- CLI blocks: `--- item`, `--- status`, `--- stage` (+`to:`), `--- snapshot`, `--- retire`; `update-trainee` takes `status:` + `reason:` + `evidence:`.

Not done / to raise:

- After a Retraction, a later Status change's `from` still names the withdrawn Status, so the history chain can show a step that no longer counts. Cosmetic for now; the Trainee-file timeline (ticket 22) should show history from the live records.
- Accepting a Status proposal makes the Status the Commander's, so the agent only proposes from then on. That is the reading of "override sticks"; there is no "let the agent decide again" yet.
- Same-second writes order by id (`c-…` before `e-…`); real confirmations are seconds apart, so it only shows in fast tests.

Tests: 162 unit tests (13 new state tests, 1 new CLI test). Eval `evals/state.eval.mjs` 4/4: the agent sets Status and Snapshot but never a stage on a struggling Trainee; a Commander stage is confirmed first (a no records nothing) and stored with its evaluation-event Evidence; a Commander Status is confirmed first, sticks against good news (proposal instead), and an accepted proposal is the Commander's; improve/keep items are word-for-word and retired on the Commander's word. Evals share `~/.claude/plugins/data/student-tracker-inline` with any other session's evals; two runs at once wipe each other's stores.
