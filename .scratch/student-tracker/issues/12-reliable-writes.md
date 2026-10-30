# 12: Reliable writes — chunked Entries, resume, rebuild

**Spec:** `.scratch/student-tracker/spec.md` (Storage → write protocol, ids); ADR 0002

**What to build:** Logging stays correct when a session dies mid-write or races another write. `recordEntry` writes the Entry as `writing` with its touched Trainees, then one chunk per Trainee (new records + card update, pinned by version), then marks the Entry `done`. Every `tracker` run starts with `resumePending`, so the Commander's next command silently finishes anything interrupted. Retries never duplicate records, and a drifted card can be rebuilt from its immutable sources.

**Blocked by:** 11

**Status:** resolved

- [x] Entry ids `e-YYYYMMDD-HHMM-<rand2>`; child ids `<entryId>-<n>`; a retried create on an existing id is refused, not duplicated
- [x] Each per-Trainee chunk is atomic (version-pinned card) and within 50 writes / 1 MiB
- [x] `resumePending` runs at the start of every `tracker` run and completes any Entry still `writing`
- [x] A card version conflict re-reads the sources and calls `rebuildCard`
- [x] `rebuildCard(tid)` reproduces the card from sources alone (eval: corrupt a card, rebuild, compare)
- [x] Eval: seed an Entry stuck at `writing` with one of two chunks done → next message finishes it, no duplicates
- [x] The local test backend enforces the same refusal and version semantics as the artifact database

## Comments

**2026-10-30 — implemented** (`plugins/student-tracker/lib/docs.mjs`, `lib/store.mjs`).

- Local document layer (`docs.mjs`) emulates the artifact database's write rules: create on an existing id refused (`AlreadyExists`), writes to existing documents need `if_version` (`VersionConflict`), batches 1–50 writes / ≤1 MiB / each document once; pinned batches all-or-nothing, unpinned ones apply in order and may stop part-way; documents ≤256 KiB. Files hold `{version, data}`.
- `recordEntry`: Entry created `writing` with its whole plan (`pending`) and child ids → one version-pinned chunk per Trainee → `done`, plan dropped. Racing sessions (card moved, or records already written by another session finishing the same Entry) converge: records are written individually tolerating `AlreadyExists`, then `rebuildCard`.
- `resumePending` is step 3 of every `tracker` run (silent). `rebuildCard` derives the card from records, retries ≤10 times, and skips the write when the card is already right.
- Tests: `test/docs.test.mjs`, `test/reliable-writes.test.mjs` (crash and race injected through `openStore({interrupt})`); mutation-checked. Eval (`npm run eval`): an Entry stuck after one of two chunks is finished by the next message, silently, no duplicates; a corrupted card rebuilds to the agent-written state.

Deviations / notes:
1. **Snapshot and next-Talk questions carry over on rebuild.** No record holds them yet (they are agent caches on the card), so `rebuildCard` keeps them from the previous card; a deleted card loses them. Revisit when ticket 19 stores Snapshots.
2. **Setup now writes a `changes/added` record per Trainee** so the display name is derivable from records.
3. **Store format changed** (`{version, data}` envelope, `added` records). Local stores made by the ticket-11 commit can't be read; they were test-only.
4. Each chunk is checked against 50 writes / 1 MiB before the Entry is written; the Entry document itself (≤256 KiB, holding the plan) is the tighter limit in practice.
5. The conflict → `rebuildCard` rule is enforced inside the local store command. The artifact mapping (ticket 13) must spell the same steps out for the agent.
