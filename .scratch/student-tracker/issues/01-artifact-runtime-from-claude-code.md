# Can a Claude Code plugin create and drive a Cycle's artifact database?

Type: research
Labels: wayfinder:research
Status: resolved
Blocked by:

## Question

From inside a Claude Code session running a plugin, what can the agent actually do with a claude.ai artifact as the brain and dashboard? Specifically:

- Can it create a private artifact (plain HTML page with the `db` capability, or a built-in Dashboard type if one exists) and later read/write its database (get / list / query / set / update / batch)? Which tools, which login/plan prerequisites, which Claude Code version?
- Database limits: document size, number of documents/collections, query expressiveness, batch size, concurrency/conflicts, rate limits.
- Can the page itself read the database live to render stats, and can it hide some fields (sensitive details) from rendering while the agent still reads them? Who can read the database if the artifact stays private?
- Can a plugin (skill/command text) rely on these tools being present for any Commander who installs it, and what happens when they are absent?
- How does the agent find the Commander's artifact again in a new session (URL persisted where)?

Output: findings with sources in `.scratch/student-tracker/research/artifact-runtime.md`.

## Answer

- **Yes**: a plugin can create and drive the Cycle's database. It publishes a private plain-HTML page with the `db` and `user` capabilities using the `Artifact` tool. It then reads and writes the database with `ArtifactData` (a deferred tool: load it with ToolSearch first). `ArtifactData` supports get, list, query, set, update, str_replace, delete, batch and profiles, and it acts as the Commander.
- **Don't use the Dashboard type**: a built-in "[core] Dashboard" type exists. But its figures must come from live connector queries or attached files, not from rows the agent writes. Its attached files are readable by anyone who can open it.
- **Limits**:
  - Each document is a JSON object of at most 256 KiB, and an artifact holds at most 25,000 documents.
  - Queries have no indexes (they scan the collection), take up to 10 `where` clauses and one `order_by`, and return at most 1000 results.
  - A batch holds at most 50 writes and 1 MiB.
  - There are no transactions. Every write to an existing document must pin `if_version`.
  - The total-size, per-collection and rate quotas exist, but their numbers aren't published.
- **The page reads live** through `claude.use("db")` and `onSnapshot`. Access rules work per path, not per field. The page and the agent both act as the Commander, so sensitive details can only be hidden by page code that never reads that collection. Keep them in their own collection.
- **Private means owner-only**: while the artifact stays private, only the Commander can read the database. On Team/Enterprise plans, org Owners can also reach artifacts through the Compliance API and set retention policies.
- **Prerequisites**: a Pro, Max, Team or Enterprise plan, `/login` with a claude.ai subscription account, the Anthropic API (not Bedrock, Vertex or Foundry), and no CMEK/HIPAA/ZDR. Artifacts must not be turned off by `enableArtifact:false` or org policy. They are off by default in `-p`, the Agent SDK and the GitHub Action.
- **When the tools are missing**, Claude just writes a local HTML file or says it can't publish. A plugin's `allowed-tools` can't make the tools appear, so setup must check for `Artifact` and `ArtifactData` and fail clearly.
- **Finding the artifact again**: a new session needs the URL. Keep it in `${CLAUDE_PLUGIN_DATA}` (kept across plugin updates, deleted on uninstall). As a fallback, use `Artifact` `list` by title, or `/artifacts`. The agent must read the artifact before republishing it.
- **Still unknown**: the exact minimum Claude Code version for `ArtifactData` (first changelog mention is 2.1.268), the numeric quotas and rate limits, retention on Pro/Max, and whether the Compliance API exposes database contents.

Findings with sources: [research/artifact-runtime.md](../research/artifact-runtime.md)
