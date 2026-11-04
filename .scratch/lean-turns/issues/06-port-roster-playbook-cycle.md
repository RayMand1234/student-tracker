# 06: Roster, settings, Playbook and Cycle lifecycle through the plan step

**Spec:** `../spec.md` (Implementation Decisions; Testing Decisions)

**Blocked by:** 03

**Status:** resolved

**What to build:**
- These operations go through manifest → plan: `updateTrainee`, `updateSettings`, `updateCycle`, `savePlaybookItem`, `retirePlaybookItem`, `hidePlaybookItem`, `createCycle` (seeding a published page's database), `finishSetup`, `copyCommanderScope` (reads a snapshot of the previous Cycle) and `archiveCycle`.
- `connect` stays with the model, since it uses the Artifact tool's `list` action. The pointer file stays as is.

- [ ] A manifest and a plan for each operation above. Operations across two Cycles take two snapshots: the current one and the other address.
- [ ] Equivalence tests for each operation, refusals included
- [ ] Reads-manifest tests for each operation

## Comments

- 2026-11-04: Built in 7e460f6, 8bcb8dd and 312e2ca (390/390 tests). This includes the archived-Cycle refusal fix from ticket 04. Decisions ticket 07 must follow:
  - **Always pass `--pointer ${CLAUDE_PLUGIN_DATA}/cycles.json` to `plan`.** Without it, a write refused on an archived Cycle can't name the current one.
  - **New plan outputs:**
    - `pointer`: write this file with the Write tool before sending the batches.
    - `url`: send the batches to this address.
  - **Reads that carry a `url`** go to that address; their `out_dir` is `<snapshot>/@other`. Copy every read line as printed, `out_dir` included, plus its versions, into the one `--versions` file.
  - **One other Cycle per plan.**
  - **Setup step 6 is unchanged:** publish the page, then write the pointer (`current` = the page, previous added to `archived`), then `reads`/`plan create-cycle`. If `current` is still the previous Cycle, the plan refuses.
  - **`archive-cycle <prev>`'s snapshot is the archived Cycle itself.** Its output `url` says where to send.
  - **The model still owns** the pointer writes in setup, `connect` and `unpinDashboard`.
  - **Known cost:** a `create-cycle` or `copy-commander-scope` plan over 50 writes (≥ ~22 Trainees) splits into about one batch per Trainee.
