# 05: Multi-chunk Entries, records outside an Entry, Retraction, Hard delete and resume

**Spec:** `../spec.md` (Implementation Decisions: Entry writes, Conflicts; Testing Decisions: conflict and recovery cases). See also ADR 0002.

**Blocked by:** 03

**Status:** ready-for-agent

**What to build:**
- Entries too big for one batch use ADR 0002's protocol: the Entry at `writing` with `pending`, one batch per Trainee chunk, then `done`. The plan emits these batches in order.
- `recordAssessments`, `recordNextTalk`, `recordSnapshot`, `flipSensitive`, `retractEntry`, `hardDelete` and `resumePending` all go through manifest → plan.

- [ ] The plan emits ordered batches for multi-chunk Entries, and `resumePending` plans the remaining chunks of an interrupted Entry, Retraction or Hard delete
- [ ] Equivalence tests for each operation, refusals included
- [ ] Interruption test: apply only the first N batches; `resumePending`'s plan then completes the store to match an uninterrupted run
- [ ] Reads-manifest tests for each operation
