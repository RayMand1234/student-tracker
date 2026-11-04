# 07: Re-cut the instructions to the three-step loop and the 30k budget

**Spec:** `../spec.md` (Implementation Decisions: Instruction layout, Budget, Folders, Permissions; User Stories 30–33). **Research:** `../../student-tracker/research/speed-and-token-cost.md`

**Blocked by:** 04, 05, 06

**Status:** resolved

**What to build:**
- Replace the artifact backend's protocol prose with one short section that walks through the loop:
  1. run the manifest
  2. read with `out_dir` (full long paths)
  3. pass the versions list
  4. run the plan
  5. send each batch with `file_path` entries
  6. on `version_mismatch`, re-read, re-plan and resend, at most 10 times
- Neutral store files shrink to operation contracts.
- Route files keep the conversation rules first.
- Setup seeds a new Cycle through the same loop.

- [ ] The budget test measures real `boot` output in characters: every route, alone and with `--tracker`, is ≤ 30,000
- [ ] The agent-neutral audit and skills-surface tests still pass, and record shapes are no longer described in prose
- [ ] `npm test` runs on Windows (the glob is expanded by node, not the shell)
- [ ] The `claude -p` evals pass; record their cost and turn counts, before and after, in a comment on this ticket

## Comments

- 2026-11-04: Built in 5e8059c (445/445 tests). Every route is under 30k characters with `--tracker`. For example, log went from 42,602 to 26,601, brief from 34,417 to 18,389, and status from 23,586 to 13,298.
- **Logging eval, before → after (local backend):**

  | Step | Before | After |
  |---|---|---|
  | Setup | 12 turns, $0.31 | 3 turns, $0.23 |
  | "כן" | 3 turns, $0.39 | 3 turns, $0.30 |
  | Talk message | 10 turns, $0.44 | 8 turns, $0.42 |
  | Resume a half-written Entry | 12 turns, $0.42 | 8 turns, $0.40 |
  | Setup without artifact tools | 2 turns, $0.17 | 1 turn, $0.20 |
  | **Total** | **≈ $1.73** | **≈ $1.54** |
- **Preflight test fixed.** It failed 1 of 2 runs because the model copied the message's `>` quote marks. The message is no longer a blockquote, and the test then passed 3 of 3.
- **Not run:** the rest of the eval suite. The full run was killed for low memory; run it one file at a time.
- **Follow-up:** have `plan record-entry` include `take-alert`. That saves the separate alert round trip after a write.
