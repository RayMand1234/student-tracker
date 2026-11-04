# 02: Snapshot docs layer, plan step and the equivalence seam (tracer: recordEntry)

**Spec:** `../spec.md` (Implementation Decisions: One engine, Snapshot format, Write plan, Entry writes; Testing Decisions: equivalence seam). **Findings:** `01-out-dir-version-probe.md`

**Blocked by:** 01

**Status:** ready-for-agent

**What to build:**
- The store runs over a docs layer it is given.
- A snapshot docs layer reads a folder in `out_dir` layout (data-only files) plus a versions list. It records writes as a write plan instead of applying them.
- A CLI plan command runs one store operation over a snapshot and writes the plan: ordered batches, one JSON data file per write, and `if_version` where a write is pinned. It prints a short summary and the plan's location, as full long paths.
- A test helper applies a plan to a local docs store under the local docs layer's database rules.
- Built end to end for `recordEntry` when the whole Entry fits in one pinned batch.

- [ ] The store takes an injected docs layer, and local behavior is unchanged (all existing store tests pass)
- [ ] The snapshot layer reads data-only files plus the versions list. A write is recorded, never applied. A read of a document written earlier in the same plan sees that write.
- [ ] A plan command for `record-entry`, taking the same text payload as the local command. A plan is batches of ≤50 writes and ≤1 MiB, each document once, with data in files.
- [ ] Equivalence test: the same `recordEntry` cases, run on the local backend and through snapshot → plan → apply, give identical stores and identical refusals (fixed clock and random source). Cases include sensitive parts, Assessments, changes and refusals.
- [ ] Stale-pin case: apply refuses and writes nothing; a new snapshot → re-plan → apply succeeds
- [ ] CLI tests spawn the CLI through `node`, so they run on Windows
