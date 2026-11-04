# 07: Re-cut the instructions to the three-step loop and the 30k budget

**Spec:** `../spec.md` (Implementation Decisions: Instruction layout, Budget, Folders, Permissions; User Stories 30–33). **Research:** `../../student-tracker/research/speed-and-token-cost.md`

**Blocked by:** 04, 05, 06

**Status:** ready-for-agent

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
