# 03: Reads manifest and missing-read refusal

**Spec:** `../spec.md` (Implementation Decisions: Reads manifest; Testing Decisions: reads-manifest test). **Findings:** `01-out-dir-version-probe.md`

**Blocked by:** 02

**Status:** resolved

**What to build:**
- For an operation and its arguments, the CLI prints the `ArtifactData` reads it needs (get/list/query with filters and limits), in a form the model sends in one message.
- If a snapshot is missing a document the operation needs, planning refuses and names the missing reads, instead of treating the document as absent.
- Tell "read and absent" (a `get` that found nothing, recorded in the snapshot) apart from "never read".

- [ ] A manifest command for `record-entry`, in a shape later operations plug into
- [ ] The snapshot records which reads were made, so a missing document can be told apart from one never fetched
- [ ] Test: a snapshot holding exactly the manifest's reads plans successfully, and removing any one read refuses and names it
- [ ] Output stays short: paths, versions and results only, no document contents

## Comments

- 2026-11-04: Built in 597be8f (340/340 tests). Decisions tickets 04–06 must follow:
  - **CLI:** `reads <op> --snapshot <dir> [args] < payload` prints `{"reads": [...]}`, one `ArtifactData` read per line without `url`, with `out_dir` set to the full long snapshot path. The `--versions` file given to `plan` holds the read lines that were made (a get that found nothing included) plus the version lines.
  - **Missing reads:** planning refuses with `missing reads:` followed by the reads to send. The model sends them into the same snapshot, appends their lines and plans again.
  - **The store reads only through** `docs.get`, `docs.list`, `docs.query(collection, [[field,'==',value]])` and `docs.taken(path)`.
    - A get is covered by a get of that path or a list of its collection.
    - A list is covered only by a list.
    - A query is covered by the same query, or by a list.
    - Look records up through the same query rather than with a get.
  - **`taken`** is for id probes before a create and needs no read.
    - Resume paths (ticket 05) must read the pending Trainees' subcollections and their `sensitive` query.
  - **A Trainee's sensitive records** are `query sensitive where trainee == tid`.
  - **Lists and queries fetch one page of 1000.** Truncation isn't detected yet.
  - **Adding an operation** takes three things:
    1. a `PLANNED` entry with `reads` (helpers: `getRead`, `listRead`, `queryRead`, `CYCLE_READS`, `traineeReads(tid)`)
    2. equivalence cases built through `fetchReads` in `test/fixtures/plan-seam.mjs`
    3. a row in the manifest test that drops each read in turn
