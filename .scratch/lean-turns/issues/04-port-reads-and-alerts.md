# 04: Reads, status, Playbook selection and alerts through the plan step

**Spec:** `../spec.md` (Implementation Decisions: display-safe check, card build, alerts and the other logic in existing code; Testing Decisions)

**Blocked by:** 03

**Status:** resolved

**What to build:** `readCycle`, `readTeam`, `readTrainee`, `readStatus`, `readPlaybook`, `takeAlert` (with its `meta/alerts` write) and `rebuildCard` run over a snapshot: manifest, then plan. The reads return their result, and `takeAlert` and `rebuildCard` also emit writes. Reads of an archived Cycle work the same way, with the archived address.

- [ ] A manifest and a plan for each operation above
- [ ] Equivalence tests: each read returns the same result as on the local backend, and after apply the stores match for `takeAlert` and `rebuildCard`
- [ ] Reads-manifest tests for each operation

## Comments

- 2026-11-04: Built in 5e2db68 (353/353 tests). Decisions ticket 07 must follow:
  - **A read is a plan with no writes.** `plan <op>` prints `{result, plan: null, batches: []}`, and the model replies from `result`.
    - The same applies to `take-alert` with nothing due, and to `rebuild-card` when the card is already current.
    - Reads still need the `reads` → fetch with `out_dir` → `plan` steps.
  - **Arguments match the local commands.** Pass the same arguments to `reads` and to `plan`.
  - **Archived Cycle:** the same reads, sent to the archived URL. `take-alert` and `rebuild-card` are refused there.
  - **Open issue:** a write refused on an archived Cycle through `plan` gives the wrong advice ("אין מחזור נוכחי…"). The cause is the `currentName` fallback in the store's `open()`. Handed to ticket 06.
  - **Known gap:** `read-trainee` lists all of `entries`, one page of 1000.
