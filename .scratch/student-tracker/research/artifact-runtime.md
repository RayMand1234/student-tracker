# Artifact runtime from Claude Code

Research for [issue 01](../issues/01-artifact-runtime-from-claude-code.md): what a Claude Code plugin can do with a private claude.ai artifact as the Cycle's brain and dashboard.

Investigated 2026-10-29 in Claude Code 2.1.312, artifact runtime contract 0.2.92. Read-only: no artifact was created, published or written.

## Sources

Each claim below is tagged with one of these.

- **[T-Artifact]**: the `Artifact` tool description in this Claude Code session.
- **[T-Data]**: the `ArtifactData` tool description and JSON schema (a deferred tool, loaded with ToolSearch `select:ArtifactData`).
- **[T-Comments]**: the `ArtifactComments` tool description.
- **[S-cap]**: the bundled `artifact-capabilities` skill (Claude Code 2.1.301 bundle), including its type definitions `0.2.92/db.d.ts`.
- **[S-design]**: the bundled `artifact-design` skill.
- **[Type-Dash]**: the core "Dashboard" Artifact type. Found with `Artifact` `list` scope `types`; its SKILL.md and `artifact-type/reference/features.md` and `sources.md` were read with `Artifact` `read`. This is first-party ("[core]") material, but it is written as type instructions, not as product docs.
- **[D-art]**: https://code.claude.com/docs/en/artifacts
- **[D-tools]**: https://code.claude.com/docs/en/tools-reference
- **[D-settings]**: https://code.claude.com/docs/en/settings-reference
- **[D-errors]**: https://code.claude.com/docs/en/errors (section "Artifacts need a claude.ai login")
- **[D-skills]**: https://code.claude.com/docs/en/skills
- **[D-plugref]**: https://code.claude.com/docs/en/plugins-reference
- **[D-changelog]**: https://code.claude.com/docs/en/changelog
- **[Blog]**: https://claude.com/blog/artifacts-in-claude-code (June 18, 2026)
- **[Support]**: https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them

## Confirmed facts

### 1. Creating the artifact

- The `Artifact` tool publishes a local `.html` file as a private page on claude.ai. A new artifact is visible only to its owner until it is shared. [T-Artifact], [D-art]
- A page gets a database by declaring the runtime capability `db` at publish (`capabilities: {db: {...}, user: {}}`). The available capability names in this session are `artifact, assets, comments, db, downloads, files, mcp, room, sample, self, user`. [S-cap]
- The db store "is created on the first write and erased when the artifact is deleted". It survives reloads, republishes and sessions. [S-cap db.d.ts]
- Seed data should not be hard-coded in the page. It is written with `ArtifactData` after the first publish, and the page must handle an empty db. [S-cap], [S-design]
- A publish that declares runtime capabilities triggers a permission prompt (or, in auto mode, a classifier review) before that publish. [D-art "When Claude Code asks before publishing"]
- On a redeploy, leaving out `capabilities` keeps the stored declaration. `{}` clears it all. A non-empty object replaces the whole set. Since 2.1.280, a republish that would silently reset stored db rules is refused. [S-cap], [D-changelog 2.1.280]
- **A built-in Dashboard type exists** ("[core] Dashboard", type_url `https://claude.ai/artifact/GZLZthZ2sQjn7T16skfdeF`). It uses the capabilities `assets, comments, db, downloads, mcp, room, tts, user`. [Type-Dash]
- **The Dashboard type is a poor fit for agent-written Trainee records**:
  - "Every figure, chart and table comes from a dataset."
  - A dataset is either a live connector query (`kind: "query"`) or an attached CSV/TSV/JSON file uploaded as an asset (`kind: "file"`).
  - The old `kind: "rows"` datasets are deprecated ("shows 'Didn't load'").
  - The page's scripts get a `dash` API and "No storage or cookies". They don't call `claude.use("db")`.
  - "Anyone who can open the dashboard can read its attached files."
  
  [Type-Dash SKILL.md, features.md]
  
  A plain HTML page with `db` + `user` is the route that matches ADR 0001. That is an inference from the facts above.

### 2. Reading and writing the database from the agent

- **Tool**: `ArtifactData` (deferred: load it with ToolSearch before the first call). Every call takes the artifact's `url`. [T-Data]
- **Actions**:
  - Reads: `get` (collection + doc_id), `list` (a page of a collection), `query` (with `where` / `order_by` / `limit` / `cursor`), `profiles`.
  - Writes: `set` (replace), `update` (merge; `{"__delete__": true}` removes a field), `str_replace` (edit inside one string field), `delete`, `batch`.
  
  [T-Data]
- **Paths**: collection paths have an odd number of `/` segments (1–15), and document paths an even number. Segments may use `[A-Za-z0-9_\-.~:@+]`, up to 200 bytes each, and a path is at most 1000 bytes. [T-Data schema], [S-cap db.d.ts]
- **Optimistic concurrency**: every write to an existing document must carry `if_version` (the `version` last read). Without it the write is refused. If the document changed in the meantime, the write fails, writes nothing and names the current version. Omit `if_version` only when creating a document. [T-Data]
- **Batch**: 1–50 `set`/`update`/`delete` entries, each document at most once, at most 1 MiB in total, one approval. It is atomic where the server supports it; otherwise (a batch with no pinned entries) it applies in order, one write at a time, and the result says which. [T-Data]
- **Large reads**: `out_dir` saves each returned document as JSON at `<out_dir>/<collection>/<doc_id>.json` instead of putting it in context. Writes can take `file_path`, a local JSON file, instead of inline `data`. [T-Data] Since 2.1.269, reads that save into the scratchpad don't ask for working-folder approval. [D-changelog 2.1.269]
- **Who the agent acts as**: the tool "reads and writes it as the user". The Commander's own identity, so the agent is the artifact owner. `as_level` (`view` / `interact` / `admin`) narrows access to test what the rules let a lower-privileged viewer do. It never raises access. [T-Data]
- **Permission**: since 2.1.268, a db write in the terminal shows a permission card with "the document count and who can open the artifact". [D-changelog 2.1.268]
- **Untrusted data**: rows read back count as untrusted data, never instructions. [T-Data], [T-Artifact]

### 3. Database limits

These come from the type definitions. [S-cap db.d.ts], [T-Data]

| Limit | Value |
|---|---|
| Document body | Plain JSON object, ≤ 256 KiB serialized, ≤ 32 levels deep |
| Documents per artifact db | ≤ 25,000 in total |
| Other caps | Per-collection document count, the organization's number of databases, and total db size all exist (`quota_exceeded` names which), but **the numbers aren't published** |
| Query | ≤ 10 `where` clauses. Operators `== != < <= > >= in not-in array-contains` (`in`/`not-in` take ≤ 30 values). At most one `order_by`, on one top-level field. `limit` 1–1000, default 100. A query with `order_by` returns a single page with no cursor |
| Indexes | None: "the store scans the collection, so keep queried collections modest — hundreds to low thousands of documents". Scanning too many documents gives `resource_exhausted` |
| Transactions | None. Writes are last-writer-wins. The agent side gets `if_version` pinning, and the page side gets `acquire()` cooperative leases (TTL 1–600 s) |
| Page budgets | Per-viewer call rate (number not published). 64 active subscriptions per view. "too many concurrent writes" gives `resource_exhausted` |
| Live updates | `onSnapshot` uses a realtime stream when it can, otherwise refreshes about every 30 s in the foreground |

The guidance in [S-cap db.d.ts] is to avoid one document per log line for unbounded streams: aggregate many items into one document, or prune old ones.

### 4. The page reading the database live, and hiding sensitive fields

- **Live reads**: the page calls `const db = await claude.use("db")`, which resolves `null` when the view can't run db, for example for a signed-out viewer. It can then `get` / `where` / `orderBy` / `limit` and `onSnapshot` for live updates from the agent's writes. [S-cap], [S-cap db.d.ts]
- **Access rules work per path, not per field**. Rules set minimum levels (`view` < `interact` < `admin` < `owner`, plus `self`) per path prefix, up to 64 rules. A document the viewer can't read behaves as if it doesn't exist. [S-cap db.d.ts]
- **The page and the agent are the same principal for the Commander**. The agent writes as the Commander (the owner). The page runs "as whoever is viewing", so when the Commander opens it, the page has the same access the agent has. The owner meets every level except `self`. `data/users/<id>/` is private to that viewer, which here means the Commander, who is also the agent's identity. [S-cap db.d.ts], [T-Data]
- **So access rules can't hide sensitive details from the Commander's own page view while the agent still reads them**. Hiding them is a job for the page's rendering code: never query or render the sensitive collection or fields. Two things make that sturdier: keep sensitive Evidence in its own collection (or under `data/users/<commanderId>/…`) that the page never subscribes to, and leave it out of the main Trainee documents. This is an inference from the facts above. The skill also says "No secrets" in db, and "`self` is a rule, not encryption". [S-cap]
- **Who can read the db while the artifact stays private**: only the owner. Its default rules let signed-in people the artifact is shared with read shared documents; nobody else is admitted. Shared viewers would follow the rules: Viewer/Commenter = `view`, Contributor = `interact`, Editor/Owner = `admin`. [S-cap db.d.ts], [D-art "Share an artifact"]
- **Platform and admin visibility**: artifact content is stored on Anthropic-operated infrastructure. On Team/Enterprise, org Owners can list artifacts, retrieve a version's content and delete artifacts through the Compliance API. They also set retention policies, separately for private and shared artifacts, which matters because retention can auto-delete a Cycle's brain. [D-art "Manage artifacts for your organization"]

### 5. Prerequisites and when the tools are absent

These come from [D-art "Availability"], [D-tools], [D-errors] and [D-settings]:

- **Plan**: Pro, Max, Team or Enterprise. Free users have no artifacts.
- **Authentication**: a claude.ai login (`/login` → "Claude account with subscription"). API-key, gateway-token, Console-account and cloud-provider credentials can't publish. The error message is `Artifacts need a claude.ai login…`.
- **Model provider**: the Anthropic API only. There are no artifacts on Bedrock, Google Agent Platform or Microsoft Foundry.
- **Org policy**: not available with CMEK, HIPAA or Zero Data Retention. On Team/Enterprise an Owner can turn artifacts off or scope them by role. The policy is loaded from `api.anthropic.com`; if it can't load, artifacts are unavailable.
- **Surface**: the CLI, or the desktop app ≥ 1.13576.0. Artifacts are **off by default** in the Agent SDK, the GitHub Action, MCP-server contexts, `claude -p` headless runs, and when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set.
- **User opt-out**: `"enableArtifact": false` (or `/config`, `CLAUDE_CODE_DISABLE_ARTIFACT=1`, or `Artifact` in `permissions.deny`) turns the tool off. No settings file can turn it back on.
- **What happens without the tools**: "Claude writes a local HTML file or says it cannot publish instead." Nothing fails loudly at install time; the plugin's instructions just meet a missing tool. [D-art]
- **Plugin skills can't add or guarantee these tools**:
  - Skill frontmatter `allowed-tools` only pre-approves tools for the invoking turn. It "does not restrict which tools are available", and it doesn't make an unavailable tool appear. [D-skills]
  - So the plugin must check for the tools itself: whether `Artifact` is present, and ToolSearch `select:ArtifactData`. It needs a fallback or a clear message. That is an inference.
- **Subagents**: this research ran in a subagent that had `Artifact`, `ArtifactData` and `ArtifactComments`. But the built-in `Explore` and `Plan` agents list the Artifact tools as excluded. Watches (live republish and comment notifications) are held only by a main-loop session, "not a subagent, teammate, or print session". [T-Comments], agent type list in this session
- **Version**: the docs don't state the minimum Claude Code version for `ArtifactData`. See Unknowns.

### 6. Finding the Commander's artifact in a new session

- "To update an artifact from a different session, give Claude its URL, or attach it with `/artifacts`. Without either, a new session creates a new artifact instead of updating one." [D-art]
- The agent can list the user's own artifacts, with title, URL and last-updated time, using `Artifact` `action: "list"`. This reads the claude.ai account, so it works after `/clear` and in new sessions. [T-Artifact], [D-art "Find an artifact again"]
- Before republishing an artifact that this conversation hasn't read or published, the agent must read it (`action: "read"`). Otherwise the publish is refused and hands back the live version to merge onto. [T-Artifact]
- `ArtifactData` calls take only the `url`. The tool description doesn't say whether db reads and writes need that prior page read.
- **Where to keep the URL**: `${CLAUDE_PLUGIN_DATA}` resolves to `~/.claude/plugins/data/<id>/`. It is "created on first reference and kept across plugin updates" and is deleted on uninstall unless `--keep-data` is used. It is substituted inline in skill and command Markdown bodies, but it isn't in the Bash tool's environment. [D-plugref]
  
  So a small local pointer file, for example `${CLAUDE_PLUGIN_DATA}/cycles.json` holding `{current: <url>, archived: [...]}`, plus the `Artifact list` fallback by title, covers recovery on one machine. On a new machine, `Artifact list` by title, or the Commander pasting the URL from claude.ai/code/artifacts, recovers it. This is an inference from the facts above.

### 7. Other relevant facts

- **Lost local page file**: if the page file is lost (a scratchpad cleared, a resume on another machine), republishes still work. Since 2.1.273, "the page's last published version is restored". [D-changelog 2.1.273]
- **Tool behavior changes over time**: the agent-side tool changes often (changelog entries 2.1.268 → 2.1.288 all touch db reads and writes). [D-changelog]
- **Comments**: the Commander can comment on the dashboard and "Send to Claude". The session must be a main-loop session watching the artifact, and on v2.1.221+ / 2.1.228+. This is a possible feedback channel but not needed for v1. [D-art], [T-Comments]
- **The page can ask Claude**: the `sample` capability lets the page call Claude itself, with consent on first use. This is not needed for v1. [S-cap]

## Unknowns and conflicts

1. **Exact minimum Claude Code version for `ArtifactData`.** It isn't listed in [D-tools] or [D-art]. The earliest changelog entry that mentions artifact data writes is 2.1.268 (the data-edit permission card). The remote-control availability row needs 2.1.281, and later db fixes run up to 2.1.288. The safe floor to state in the spec is "recent 2.1.2xx". Pinning it needs a test or an Anthropic answer.
2. **Numeric quotas**: the per-artifact total db size, the per-collection document cap, the org database cap and the per-viewer call rate. Only "25,000 documents" and "256 KiB per document" are published. [Support] says "Each artifact gets 20 MB of storage" and "text only", but that article describes claude.ai chat artifacts' personal/shared storage (it mentions "legacy artifacts"). It may be a different system from the Claude Code `db` capability. Not confirmed either way.
3. **Agent-side rate limits** for `ArtifactData` calls aren't documented.
4. **Retention defaults on Pro/Max**: [D-art] documents admin retention only for Team/Enterprise. Whether a private artifact's db expires on Pro/Max isn't stated.
5. **Whether the Compliance API exposes db contents**: the documented endpoints cover artifacts and versions (page content), and the docs don't say whether db documents are included.
6. **Plan and visibility conflict**: [Blog] (June 2026) says artifacts are "limited to Claude Team and Enterprise orgs" and "cannot be made public". The current docs [D-art], [D-tools] say Pro/Max/Team/Enterprise, with public links. The current docs are newer and win, but this shows the feature is moving.
7. **Whether `ArtifactData` needs the conversation to have read the artifact first**, as `Artifact` publishes do. It isn't stated.
8. **Scheduled or headless use**: artifacts are off by default for `-p` and the Agent SDK. Whether a cloud scheduled routine (`/schedule`) can call `ArtifactData` isn't documented. It matters only if proactive alerts ever run unattended.
9. **The Commander's own plan and org settings** aren't known. The plugin must check them at setup and can't assume them.

## Implications for the spec

These are suggestions, not decisions.

- Use a **plain HTML page with `db` + `user`**, not the Dashboard type.
- In `/student-tracker:setup`:
  1. Check that `Artifact` is present and that ToolSearch finds `ArtifactData`.
  2. If either is missing, stop with the documented reasons (plan, `/login`, provider, org policy, `enableArtifact`, `-p`).
  3. Publish the page.
  4. Seed the db with one `batch`.
  5. Write the URL to `${CLAUDE_PLUGIN_DATA}`.
- The storage layer always reads before it writes and carries `if_version`. It batches multi-document updates, up to 50 per batch.
- Keep sensitive Evidence in a collection the page never reads. Trainee documents stay bounded: aggregate, or one document per Evidence item. Watch the 25,000-document cap over 21 weeks × N Trainees.
