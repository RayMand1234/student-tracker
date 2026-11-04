# 06: Roster, settings, Playbook and Cycle lifecycle through the plan step

**Spec:** `../spec.md` (Implementation Decisions; Testing Decisions)

**Blocked by:** 03

**Status:** ready-for-agent

**What to build:**
- These operations go through manifest → plan: `updateTrainee`, `updateSettings`, `updateCycle`, `savePlaybookItem`, `retirePlaybookItem`, `hidePlaybookItem`, `createCycle` (seeding a published page's database), `finishSetup`, `copyCommanderScope` (reads a snapshot of the previous Cycle) and `archiveCycle`.
- `connect` stays with the model, since it uses the Artifact tool's `list` action. The pointer file stays as is.

- [ ] A manifest and a plan for each operation above. Operations across two Cycles take two snapshots: the current one and the other address.
- [ ] Equivalence tests for each operation, refusals included
- [ ] Reads-manifest tests for each operation
