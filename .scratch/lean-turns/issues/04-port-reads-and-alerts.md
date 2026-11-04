# 04: Reads, status, Playbook selection and alerts through the plan step

**Spec:** `../spec.md` (Implementation Decisions: display-safe check, card build, alerts and the other logic in existing code; Testing Decisions)

**Blocked by:** 03

**Status:** ready-for-agent

**What to build:** `readCycle`, `readTeam`, `readTrainee`, `readStatus`, `readPlaybook`, `takeAlert` (with its `meta/alerts` write) and `rebuildCard` run over a snapshot: manifest, then plan. The reads return their result, and `takeAlert` and `rebuildCard` also emit writes. Reads of an archived Cycle work the same way, with the archived address.

- [ ] A manifest and a plan for each operation above
- [ ] Equivalence tests: each read returns the same result as on the local backend, and after apply the stores match for `takeAlert` and `rebuildCard`
- [ ] Reads-manifest tests for each operation
