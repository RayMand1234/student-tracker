# 05: Multi-chunk Entries, records outside an Entry, Retraction, Hard delete and resume

**Spec:** `../spec.md` (Implementation Decisions: Entry writes, Conflicts; Testing Decisions: conflict and recovery cases). See also ADR 0002.

**Blocked by:** 03

**Status:** resolved

**What to build:**
- Entries too big for one batch use ADR 0002's protocol: the Entry at `writing` with `pending`, one batch per Trainee chunk, then `done`. The plan emits these batches in order.
- `recordAssessments`, `recordNextTalk`, `recordSnapshot`, `flipSensitive`, `retractEntry`, `hardDelete` and `resumePending` all go through manifest → plan.

- [ ] The plan emits ordered batches for multi-chunk Entries, and `resumePending` plans the remaining chunks of an interrupted Entry, Retraction or Hard delete
- [ ] Equivalence tests for each operation, refusals included
- [ ] Interruption test: apply only the first N batches; `resumePending`'s plan then completes the store to match an uninterrupted run
- [ ] Reads-manifest tests for each operation

## Comments

- 2026-11-04: Built in 4f14157 and 233ad1d (363/363 tests). Decisions ticket 07 must follow:
  - **Plan shape:** a plan that fits one batch stays one atomic batch. Otherwise it gives the store's batches in ADR 0002 order, each pinned to the versions the earlier batches produce. Send them strictly in order. A plan of 2 or more batches prints `if_refused`.
  - **If batch 1 is refused,** re-read, re-plan and resend.
  - **If a later batch is refused,** don't re-plan the original: that would record the Entry twice. Run `resume-pending` (reads → fetch → plan → send) instead, and answer the Commander from the first plan's `result`.
  - **A second round of reads is normal** for `retract-entry`, `hard-delete`, `resume-pending` and `flip-sensitive`: planning asks for the Trainees' card reads as "missing reads". The model must treat that as a step, not an error.
  - **`resume-pending` costs a round trip every turn,** even with nothing pending. Ticket 07 should fold its reads into the Start reads, so the first turn's single read message covers `connect`, `resume-pending`, `read-cycle` and `read-team`.
