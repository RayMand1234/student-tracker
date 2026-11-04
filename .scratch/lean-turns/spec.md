# Lean turns: the store CLI does the artifact backend's work

Status: ready-for-agent

**Research:** `.scratch/student-tracker/research/speed-and-token-cost.md`. **ADRs:** 0001 (artifact database behind one storage layer), 0002 (derived card, chunked Entry writes with `writing` → `done`).

## Problem Statement

A short tracker session costs the Commander over 100k tokens and many slow round trips. Logging one Talk loads about 42,700 characters of instructions. That's over the ~30,000-character limit for text injected by a skill, so it arrives as a file path plus a preview, and the model has to read the file in an extra turn. Most of that text is the artifact backend's protocol written as prose: how to read, how to build the Trainee card, how to run the display-safe check, how to compute alerts and status, and how to write version-pinned batches. The model executes all of it by hand, one `ArtifactData` call at a time, and writes every record's JSON as output tokens. The same logic already exists as tested code for the local backend. The result is slow replies, expensive sessions, and two implementations of every storage rule that can drift apart.

## Solution

For the artifact backend, the store CLI becomes the engine, as it already is for the local backend. Each operation becomes three steps:

1. The model fetches the documents the operation needs into a snapshot folder (`ArtifactData` reads with `out_dir`). The CLI says which reads.
2. `student-tracker-store` runs the existing store logic over that snapshot and emits a write plan: the batch or batches to send, with each document's data in its own file.
3. The model sends the plan with `ArtifactData` `batch`, one entry per document pointing to its file, and reports what the CLI says happened.

The model no longer reads protocol prose, builds cards, runs checks or writes record JSON. A route's instructions shrink to the conversation rules (how to talk to the Commander, how to split an Entry into Evidence, what to ask and when) plus a few lines on running the CLI. Every injection stays under 30,000 characters. Behavior is the same as today, and an equivalence test proves it against the local backend.

## User Stories

1. As a Commander, I want logging a Talk to finish in fewer round trips, so that I get my reply in seconds, not minutes.
2. As a Commander, I want a session to cost far fewer tokens, so that I can track a whole Cycle without hitting usage limits.
3. As a Commander, I want the tracker's behavior unchanged by this work, so that my Entries, Evidence, Ratings and alerts mean what they meant before.
4. As a Commander, I want an Entry about several Trainees saved fully or resumable, so that a crash mid-write never leaves half a record.
5. As a Commander, I want a write that collides with another session (a version conflict) retried automatically, so that I never see a storage error for an ordinary race.
6. As a Commander, I want sensitive parts kept out of every display text exactly as today, so that moving the check into code never leaks a personal detail to the dashboard.
7. As a Commander, I want the display-safe check to be deterministic, so that the same text is accepted or refused every time.
8. As a Commander, I want refusals reported in plain Hebrew with the reason, so that I know what to fix.
9. As a Commander, I want "בטל" (Retraction) and a Hard delete to behave as before, so that withdrawing a mistaken Entry stays safe.
10. As a Commander, I want the brief, team status and alerts computed by the same code the local backend uses, so that the numbers (days since Talk, Trends, shared weaknesses) are identical everywhere.
11. As a Commander, I want the dashboard to keep reading live cards, so that it updates as soon as the agent writes.
12. As a Commander, I want reads of an archived Cycle to keep working, so that I can still ask about the previous Cycle.
13. As a Commander, I want writes to an archived Cycle still refused, so that an old Cycle stays read-only.
14. As a Commander, I want an interrupted write from an earlier session finished silently on the next turn (`resumePending`), so that I never have to repair anything.
15. As a Commander, I want setup to stay a short conversation, so that starting a Cycle is unchanged for me.
16. As a Commander, I want my Playbook items, hides and settings handled by the same engine, so that Playbook commands are fast too.
17. As a Commander on Windows, I want the CLI to work in my shell, so that the plugin works on my machine.
18. As a Commander, I want the plugin to ask for permission no more often than today, so that the faster flow isn't interrupted by prompts.
19. As the plugin maintainer, I want one implementation of every storage rule, so that a fix lands once and covers both backends.
20. As the plugin maintainer, I want an equivalence test that runs each operation directly on the local backend and through snapshot → plan → apply, then compares the stored state, so that I can trust the artifact path without a live claude.ai page.
21. As the plugin maintainer, I want a budget test that keeps every `boot` injection under 30,000 characters, so that the instructions can't silently grow past the inline limit again.
22. As the plugin maintainer, I want the CLI to tell the model which reads an operation needs, so that the model fetches them in one round trip, not by trial and error.
23. As the plugin maintainer, I want the CLI to name any document it needed but didn't find in the snapshot, so that a missed read is retried instead of computed on stale or missing data.
24. As the plugin maintainer, I want the write plan to carry each document's pinned version, so that the database still refuses a write over a document that moved.
25. As the plugin maintainer, I want a version conflict on sending a plan to lead to re-read, re-plan, resend (at most 10 times), so that the retry rule lives in one short instruction line.
26. As the plugin maintainer, I want an Entry whose records fit in one batch sent as one pinned, all-or-nothing batch, so that the common case is a single write call.
27. As the plugin maintainer, I want larger Entries to keep ADR 0002's `writing` → per-Trainee chunks → `done` protocol, with the CLI emitting the batches in order, so that the 50-write limit is respected and recovery still works.
28. As the plugin maintainer, I want the snapshot folder laid out exactly as `out_dir` saves reads, so that no copying or reshaping is needed between the read and the CLI.
29. As the plugin maintainer, I want snapshot and plan folders created fresh per operation in the session scratchpad, never under the plugin's data or cache folders, so that stale files can't leak between turns.
30. As the plugin maintainer, I want the storage-neutral reference files to keep naming storage operations rather than tools, so that ADR 0001's isolated layer and its agent-neutral audit still hold.
31. As the plugin maintainer, I want the `claude -p` evals to pass unchanged, so that end-to-end behavior is checked as before.
32. As the plugin maintainer, I want the artifact protocol prose removed from the shipped references once the CLI covers it, so that nothing loads text the model no longer needs.
33. As the plugin maintainer, I want the conversation rules (Hebrew replies, what to ask, how to split an Entry, alert wording) kept intact and near the top of each injection, so that they survive compaction, which keeps only a skill's first 5,000 tokens.
34. As the plugin maintainer, I want the CLI's outputs short and decision-ready (ids written, the alert to show, the refusal reason), so that the model's context holds results, not data.
35. As a future maintainer porting to another agent, I want the engine to be plain code behind the CLI, so that a neutral store can replace the artifact database later (ADR 0001).

## Implementation Decisions

- **One engine.** The store module's operations run unchanged for both backends. The local backend applies writes immediately, as today. For the artifact backend, the store runs over a **snapshot docs layer**: it reads documents from a snapshot folder and records writes into a write plan instead of applying them. The store module gets the ability to take a docs layer, rather than opening the local docs layer by path itself.
- **Snapshot format** is what `ArtifactData` `out_dir` saves: `<collection path>/<doc id>.json`. That is the path scheme the local docs layer already uses. The snapshot layer adapts the file contents (data, and version wherever the read records it) to the `{version, data}` shape the store expects.
- **Reads manifest.** For every operation, the CLI can print the reads it needs (`get`/`list`/`query` with filters), given its arguments, as a short list the model sends in one message. If planning hits a document that's missing from the snapshot, the CLI refuses with the missing paths instead of guessing. The model fetches those and re-runs the plan.
- **Write plan.** The plan is an ordered list of batches (each 1–50 writes, ≤1 MiB, each document once). Each write gives the op, collection, doc id, `if_version` when it changes an existing document, and the path of a file holding its data. The CLI prints a compact summary (batch count, ids per kind, the reply-relevant result such as the alert or card) plus where the plan lives. The model sends each batch with `ArtifactData` `batch`, using `file_path` per entry.
- **Entry writes.** If all of an Entry's records and card updates fit in one batch, send one pinned, all-or-nothing batch. Otherwise keep ADR 0002: create the Entry at `writing` with its `pending` chunks, send one batch per Trainee, then mark `done`. `resumePending` plans the remaining chunks the same way.
- **Conflicts.** A refused batch writes nothing. The model re-reads (a fresh snapshot), re-plans and resends, at most 10 times. That rule is the only one left in the model's instructions.
- **Time and ids** come from the CLI (it already generates them for the local backend). The model no longer runs `date` for ids or `at` values.
- **Display-safe check, card build, alerts, status, Playbook selection, Ratings and Trends** all run in the existing tested code. Their prose descriptions leave the shipped references.
- **Instruction layout.** `boot` keeps injecting at skill load. A route's injection holds: the conversation rules for that route (first), the store operations it uses by name, and one short "running an operation on the artifact backend" section (reads manifest → fetch with `out_dir` → plan → send → on conflict redo). Neutral store files shrink to operation contracts (inputs, outputs, refusals). The artifact files shrink to the three-step loop.
- **Budget.** The instruction budget test changes from words per turn to characters per injection, ceiling 30,000 for every route (and for `--tracker` combined with a route), and measures the real `boot` output.
- **Folders.** Snapshot and plan folders are fresh per operation under the session scratchpad and passed to the CLI as arguments. Nothing is written under `~/.claude`.
- **Permissions.** The CLI stays reachable through the existing `Bash(student-tracker-store *)` allowance. `ArtifactData` stays the only tool that touches the database. Scripts cannot call the database directly (research Q2).
- **Unchanged.** The local backend's commands and payload format, the dashboard page, the record shapes and collections (ADR 0002), and the pointer file.

## Testing Decisions

- **Good tests check external behavior:** stored state through store reads, and the CLI's printed results. They don't check the plan's internal shape beyond what the database itself enforces.
- **One new seam: snapshot → plan → apply equivalence.** For each store operation and its refusal cases, start from the same fixture state and compare two runs:
  - (a) Run the operation directly on the local backend.
  - (b) Copy that state into a snapshot folder in `out_dir` layout, run the CLI's plan step, then apply the plan's batches to a local docs store with the local docs layer's database rules (create-refused-if-exists, `if_version` pins, batch limits, all-or-nothing when pinned).
  - The resulting stores must be identical (ids and times fixed through the store's injectable clock and random source), and refusals must match.
- **Conflict and recovery cases on the same seam:** a document moves between snapshot and apply, so the batch is refused, nothing is written, and re-plan → apply succeeds. A multi-chunk Entry is interrupted between batches, and `resumePending`'s plan completes it.
- **Reads-manifest test:** for each operation, planning over a snapshot that holds exactly the manifest's reads succeeds. Removing any one read makes planning refuse and name it.
- **Budget test:** every route's real `boot` output, alone and with `--tracker`, is under 30,000 characters.
- **Prior art:**
  - the store tests (operations through `openStore` on a temp data dir)
  - the docs-layer tests (database write rules)
  - the CLI tests (spawned commands, JSON out, refusals on stderr)
  - the instruction budget and skills-surface tests
  - the agent-neutral audit in the release test
  - the `claude -p` evals for end-to-end conversations
- **Windows:** the CLI tests spawn the extensionless bin directly, which fails on Windows. New CLI tests run it through `node`, so the suite runs on the Commander's platform.

## Out of Scope

- Changing the record model, collections, card shape or any domain rule (Ratings, Trends, alerts, sensitive categories).
- Changing what the Commander sees or is asked, beyond fewer and faster turns.
- Splitting the dashboard page into a shell plus server-copied scripts, and running the publish subagent on Haiku (separate follow-ups from the research).
- De-duplicating repeated shortcut injections within a session (the per-session "already loaded" marker; separate follow-up).
- Trimming the Commander's environment (connectors, other plugins). That's a README note, not plugin code.
- An MCP server for the store, and moving instructions into hooks (both ruled out by the research).
- A non-Claude store (ADR 0001 keeps it possible; not built here).

## Further Notes

- **First open question:** does an `out_dir` read save each document's `version` in its file, or only in the tool's result? One `get` with `out_dir` on a throwaway artifact settles it. If the version is only in the result, the reads step must also pass versions to the CLI (a short id → version list). The plan design stays the same.
- **Order of work:** settle the version question → snapshot docs layer and plan step, with the equivalence seam → move operations family by family (reads, record, roster, undo, playbook, cycle), deleting each family's artifact prose as its equivalence tests pass → re-cut the route instructions to the character budget → run the evals.
- **Expected effect (research estimates, to be measured with the evals' cost and turn counts):** about 3,200 fewer words of protocol per turn, no record JSON generated as output tokens, and a log turn going from roughly 7–9 model round trips to 4–5.
- Already done on branch `lean-skills`, outside this spec: the dashboard is published through a subagent, and Windows line endings are fixed (`boot` normalizes CRLF, and `.gitattributes` forces LF).
