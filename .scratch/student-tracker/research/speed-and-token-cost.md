# Speed and token cost of the student-tracker plugin

Research on how to make a tracker turn faster (wall-clock time, fewer model round trips) and cheaper in tokens. It builds on the measurements from a real session (setup → new Cycle → `/brief` → one question, ending at ~178k context). It does not re-derive them.

Investigated 2026-11-04 in Claude Code 2.1.318. Read-only: no artifact was created, published, read or written. The plugin's own sizes below were measured on this checkout with `student-tracker-store boot` against an empty data dir (artifact backend).

## Sources

Each claim below is tagged with one of these.

- **[T-Data]**: the `ArtifactData` tool description and JSON schema in this session (deferred tool, loaded with ToolSearch `select:ArtifactData`).
- **[T-Artifact]**: the `Artifact` tool description in this session.
- **[T-Agent]**: the `Agent` tool description and schema in this session (its `model` parameter and the agent-type list).
- **[T-Comments]**: the `ArtifactComments` tool description in this session.
- **[D-cache]**: https://code.claude.com/docs/en/prompt-caching
- **[D-costs]**: https://code.claude.com/docs/en/costs
- **[D-skills]**: https://code.claude.com/docs/en/skills
- **[D-sub]**: https://code.claude.com/docs/en/sub-agents
- **[D-hooks]**: https://code.claude.com/docs/en/hooks
- **[D-mcp]**: https://code.claude.com/docs/en/mcp
- **[D-ctx]**: https://code.claude.com/docs/en/context-window
- **[D-model]**: https://code.claude.com/docs/en/model-config
- **[D-tools]**: https://code.claude.com/docs/en/tools-reference (section "Output limits")
- **[D-settings]**: https://code.claude.com/docs/en/settings-reference (index rows only for most keys; the page was too long to read in full)
- **[D-art]**: https://code.claude.com/docs/en/artifacts
- **[D-price]**: https://platform.claude.com/docs/en/about-claude/pricing
- **[D-bp]**: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices (docs.claude.com redirects here)
- **[D-changelog]**: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md (version given per entry)
- **[Blog-cache]**: "Lessons from building Claude Code: Prompt caching is everything", Thariq Shihipar, Apr 30, 2026. https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything (redirects to claude.dev/blog/…)
- **[Eng-codeexec]**: "Code execution with MCP: Building more efficient agents", Anthropic Engineering, Nov 4, 2025. https://www.anthropic.com/engineering/code-execution-with-mcp
- **[Repo]**: this repository: `plugins/student-tracker/` (`lib/boot.mjs`, `lib/docs.mjs`, `lib/store.mjs`, `skills/*/SKILL.md`, `skills/tracker/references/**`), `.scratch/student-tracker/spec.md`, `docs/adr/0001…`, and [artifact-runtime.md](artifact-runtime.md) **[R-art]**.

Unmarked statements in **Inference** paragraphs are mine, drawn from the cited facts. **Unverified** marks a claim I could not confirm.

## Recommendations

Ranked by expected effect on this plugin. Token figures are characters measured on this checkout. Dollar figures use Opus 5.5 list prices [D-price] to show proportions. A subscriber's plan usage is not billed in dollars [D-costs], and how plan usage weights each token type is **Unverified**.

| # | Change | Expected effect | Basis |
|---|---|---|---|
| 1 | **Move the artifact-backend protocol into the CLI.** The model reads a snapshot to files (`ArtifactData` `get`/`list`/`query` with `out_dir`). `student-tracker-store` runs the checks, card build, display-safe check and alerts on those files with the code `lib/store.mjs` + `lib/docs.mjs` already has, and writes one JSON file per document. The model then sends **one `batch`** whose entries carry `file_path`, not `data`. | Drops the artifact protocol prose (`store/artifact/*.md`, ~3,200 words) and the store-rule prose from every injection. Read documents never enter context. The model stops generating record JSON as output tokens ($20/MTok on Opus 5.5, 100× the cache-read rate). For an Entry of ≤50 writes, one pinned batch is all-or-nothing, so the `writing` → chunks → `done` protocol could become a single call. Estimate: a log turn goes from ~7–9 round trips to ~4–5 (see Q2). | [T-Data], [D-bp] "Provide utility scripts", [Eng-codeexec], [Repo] `docs.mjs` |
| 2 | **Keep every `!` injection under ~30,000 characters.** `/brief` injects 33,104 characters today. | Above the Bash inline ceiling, `!` output arrives as a file path plus a 2,000-character preview. The model then needs an extra Read turn, and the same text enters context a second time. Trimming removes one round trip and ~8k tokens from each `/brief`. | [D-skills], [D-tools] |
| 3 | **Publish the dashboard through a Haiku subagent** (`model: "haiku"` on the Agent call, or a plugin agent with `model: haiku`). Longer term, split the page into a small `index.html` plus `app.js`/`style.css`, so a new Cycle copies the scripts server-side with `files: {path: {artifact, path}}` and never reads them. | The 67 KB read is billed at Haiku 5.5 rates ($0.10/MTok input vs $4 on Opus 5.5) and stays out of the main context. A server-side copy needs no read at all. | [T-Agent], [T-Artifact], [D-price], [D-sub] |
| 4 | **Stop re-injecting identical instructions.** The shortcut skills put `$ARGUMENTS` into rendered content, so every `/brief <name>` with a new name re-appends the full ~16.7k-character tracker base plus the route. | Saves ~4–8k tokens of cache-write per repeated shortcut in one session. One option: key a marker on `${CLAUDE_SESSION_ID}` so `boot` prints a one-line "already loaded" notice, and have a plugin `SessionStart` hook with matcher `compact` clear that marker. | [D-skills] "Skill content lifecycle", "Available string substitutions", [D-hooks] |
| 5 | **Protect the cache.** No `model:` in skill frontmatter. Keep ToolSearch `select:ArtifactData` batched into the first tool turn. Optionally add `effort: low` on `/dashboard`, and test it on `/status`. | A skill `model` that differs from the session model is a model switch, and the next request re-reads the whole conversation uncached. On Opus/Sonnet/Haiku 5.5 with a subscription, an effort change keeps the cache, and lower effort is "faster and cheaper". | [D-cache], [D-model] |
| 6 | **Order the boot output for compaction.** Put the rules that must survive first, and re-run `boot` after a compaction (for example from a `SessionStart` `compact` hook note). | After compaction, only the first 5,000 tokens of each invoked skill are re-attached, within a 25,000-token total. The route-specific tail of `/brief` (~33k chars) is lost first. | [D-skills], [D-ctx] |
| 7 | **Auto-approve the plugin's own calls in later turns** with a plugin `PreToolUse` hook that returns `permissionDecision: "allow"` for `student-tracker-store` Bash calls (and possibly `ArtifactData` reads of the pointer's URL). | `allowed-tools` grants clear when the Commander sends the next message. Follow-up turns (answers to the tracker's questions) can then stop on permission prompts, which costs human wall-clock time. | [D-skills], [D-hooks] |
| 8 | **Document the Commander's environment trims.** In the tracker project, turn off unused claude.ai connectors (`/mcp` toggle, or `disableClaudeAiConnectors`), disable unrelated plugins (`enabledPlugins` at project scope), and set `skillOverrides` to name-only. | The measured ~60k-token pre-prompt overhead is a cached prefix. It is cheap per request (Opus 5.5 cache read $0.20/MTok) but written once per session at the 1h write rate ($8/MTok, ~$0.48 at 60k), and it fills the window, which brings compaction sooner. | [D-mcp], [D-skills], [D-settings], [D-cache], [D-price] |
| 9 | **Don't move instructions into SessionStart/UserPromptSubmit hooks.** | Hook context is capped at 10,000 characters (the rest becomes a file plus a 2,000-character preview). `UserPromptSubmit` has no matcher and fires on every prompt. Plugin hooks fire whenever the plugin is loaded. Skills already load on demand and are cache-safe. | [D-hooks], [D-costs], [plugin-packaging.md](plugin-packaging.md) |
| 10 | **Don't wrap the CLI in an MCP server.** | A local MCP server can't reach the artifact database either (no public API; see Q2). It adds server instructions (≤4,096 chars, always loaded) and a ToolSearch round trip. The docs say CLIs are "more context-efficient than MCP servers". | [D-costs], [D-mcp] |

## 1. Claude Code features that cut per-turn tokens and latency

### 1a. Prompt caching

**What is cached and in what order.** Each request re-sends the full context. The API matches the request's prefix against recently processed content. The match is exact: "a change anywhere in the prefix recomputes everything after it. There is no per-file or per-segment caching." The layers are [D-cache]:

| Layer | Content | Changes when |
|---|---|---|
| System prompt | Core instructions, tool definitions | The set of loaded tool definitions changes |
| Project context | CLAUDE.md, auto memory, unscoped rules | Session start, `/clear`, `/compact` |
| Conversation | Messages, responses, tool results | Every turn |

**TTL.** On a Claude subscription within plan usage, the main conversation gets a **one-hour** TTL. Subagents, compaction and similar requests get **five minutes**. With usage credits, an API key or a cloud provider, both get five minutes. `promptCacheTtl` / `CLAUDE_CODE_PROMPT_CACHE_TTL` and `subagentPromptCacheTtl` override this. Each cache hit resets the timer [D-cache]. Artifacts require a claude.ai subscription session [D-art], so every artifact-backend tracker session is in the one-hour bucket while within plan usage.

**Prices (Opus 5.5)**: base input $4, 5m write $5, 1h write $8, cache read $0.20 (0.05× base on Opus/Sonnet 5.5), output $20 per MTok. Haiku 5.5 (≤100k prompt): input $0.10, cache read $0.01, output $0.50 [D-price].

**What invalidates the cache mid-session** [D-cache]:
- switching models, including a skill or command whose frontmatter `model` differs from the session model ("that turn is also a model switch"), and `opusplan` plan-mode toggles;
- changing effort, **except** on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 with an API key or subscription, where the cache is kept;
- toggling fast mode;
- connecting/removing an MCP server **only when tool search is off**. With tools deferred, "Claude Code keeps the tool list from the conversation's first request for the whole conversation";
- enabling/disabling a plugin **that provides MCP servers**. A plugin's skills, commands, agents and hooks are appended and never invalidate the cache;
- a bare-tool deny rule (only when tool search is off);
- compaction (by design), removing old images, and a Claude Code upgrade (applied at next launch).

**What keeps the cache** [D-cache]: invoking skills and commands ("inject their instructions as user messages at the point of invocation. Nothing earlier in the conversation changes"), editing files, editing CLAUDE.md (not applied until `/clear`/`/compact`/restart), changing permission mode or output style, `/recap`, `/rewind`, and spawning a subagent (the parent's cache is unaffected).

**The questions asked:**
- *Content injected by a skill or `!` command*: cache-safe. It is appended as a user message [D-cache]. It is billed at the cache-**write** rate on the request that first carries it, and at the read rate afterwards. At 1h TTL on Opus 5.5 that is $8/MTok once, then $0.20/MTok per later request. **Inference:** the volume appended per turn is the cost driver, more than the size of the prefix.
- *A changing date*: Claude Code delivers changing details (date, plan mode, edited files) in `<system-reminder>` blocks in messages, not in the system prompt, to keep the cache [Blog-cache]. Mid-conversation system context such as file-change notices is "marked for caching" [D-cache]. Nothing in the plugin puts the date in the prefix: `date` runs in Bash and lands in a tool result, which is appended.
- *Tool-list deltas*: loading `ArtifactData` through ToolSearch doesn't change the prefix. Deferred tools are sent as stubs with `defer_loading: true` [Blog-cache], and the tool list from the first request is kept [D-cache]. 2.1.302 fixed "a prompt cache miss when a tool added mid-session was loaded again through ToolSearch or after compaction" [D-changelog]. 2.1.267 also fixed a `/model` switch re-sending every tool definition.
- *Checking it*: `/usage` shows a "Prompt cache (main)" line with hit share, misses and a likely cause (v2.1.251+, cause text v2.1.260+). It covers the main conversation only [D-costs].

**Inference for this plugin:** the plugin is already cache-friendly. It appends everything and changes neither tools nor model. The remaining cache costs are (a) how much text each turn appends (Recommendations 1, 2, 4) and (b) the number of requests per turn, each of which re-reads the whole context. At 178k context on Opus 5.5 that is ~$0.036 per request, plus latency.

### 1b. Skill loading

- **Progressive disclosure.** A skill's description is always in context. The body loads only when invoked [D-skills]. The combined `description` + `when_to_use` is capped at 1,536 characters in the listing [D-skills]. The tracker's `description:` line is 749 characters [Repo].
- **`disable-model-invocation: true`**: the description is **not** in context, and the full skill loads only when the user invokes it. It also can't be preloaded into subagents [D-skills]. The plugin's six skills are all `disable-model-invocation` except `tracker` [Repo]. So the plugin adds only one description to the listing. The plugin is a small part of the measured ~65k-character skill listing.
- **Listing budget.** The listing "scales at 1% of the model's context window". When it overflows, Claude Code drops descriptions, starting with the least-invoked skills. Relevant settings are `skillListingBudgetFraction`, `SLASH_COMMAND_TOOL_CHAR_BUDGET`, `skillListingMaxDescChars`, and `skillOverrides` with `"name-only"`. `/doctor` estimates the listing's cost [D-skills].
- **`!` injection.** "The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude… Substitution runs once over the original file." Commands use the Bash tool's 2-minute timeout. A non-zero exit "aborts the entire skill invocation". The skills page also says that output past the Bash tool's inline ceiling is written to a file, and Claude gets a path plus a short preview [D-skills]. The ceiling is "roughly 30,000 characters by default", and the preview is "up to the first 2,000 characters". The user setting `bashOutputMaxChars` (≤128,000, v2.1.261+) raises it. `BASH_MAX_OUTPUT_LENGTH` does not raise the inline ceiling [D-tools]. 2.1.290 fixed multi-line `!` blocks failing with CRLF on Windows [D-changelog].
- **Measured `boot` output for this plugin** (characters, `wc -m`) [Repo]:

  | Injection | Chars | Over ~30k? |
  |---|---|---|
  | `boot --tracker` (tracker skill load, also `/dashboard`) | 16,739 | no |
  | `boot status --tracker` (`/status`) | 22,480 | no |
  | `boot research --tracker` (`/research`) | 26,291 | no |
  | **`boot brief --tracker` (`/brief`)** | **33,104** | **yes** |
  | `boot log` (route only, via Bash in the tracker skill) | 23,775 | no |
  | `boot log --tracker` (not used by any skill today) | 40,515 | yes |
  | `boot assess` / `roster` / `state` route only | 19,827 / 14,666 / 15,024 | no |

  **Inference:** `/brief` probably delivered a 2,000-character preview plus a file path, and the model then read the file. That accounts for at least part of the "extra manual-read turns", separately from the CRLF bug. **Unverified** against the transcript: look for a persisted-output notice in the `/brief` skill message.
- **Lifecycle.** The rendered SKILL.md "enters the conversation as a single message and stays there". Re-invoking with **identical** rendered content adds only a short "already loaded" note. Changed content (different arguments or new `!` output) "appends the full content again" [D-skills]. Because all four shortcut skills embed `$ARGUMENTS` and `boot` output, each new invocation re-appends ~17–33k characters. Calling `/brief` and then the tracker skill also duplicates the tracker base [Repo].
- **After compaction**, Claude Code re-attaches "the most recent invocation of each skill", "keeping the first 5,000 tokens of each", within a combined 25,000-token budget, oldest dropped first. "Put the most important instructions near the top" [D-skills], [D-ctx].
- **`allowed-tools`** pre-approves tools only "during the turn that invokes this skill", and the grant "clear[s] when you send your next message" [D-skills].
- **Per-turn `model` / `effort` frontmatter** apply "for the current turn only". With `context: fork` they set the subagent's model and effort [D-skills]. A differing `model` is a cache-breaking model switch [D-cache].
- **Reference files** are "loaded when needed". Scripts are "executed, not loaded" [D-skills].

### 1c. Deferred tools, ToolSearch, and trimming MCP/connectors

- MCP tool definitions are deferred by default: "Only tool names and server instructions load at session start" [D-mcp], [D-costs]. Tool search is on by default on supported models. `ENABLE_TOOL_SEARCH` takes `true`/`false`/`auto`/`auto:N` (threshold mode at 10% of context) [D-mcp].
- Server instructions, and descriptions of tools that load upfront, are cut at 4,096 characters. Descriptions loaded through tool search are cut at 16,384 [D-mcp].
- The built-in `ArtifactData` and `ArtifactComments` are also deferred in this session. They are listed by name and need ToolSearch before first use (session observation). I found no documented setting that preloads a built-in deferred tool. `alwaysLoad` applies to MCP servers and tools only [D-mcp]. **Unverified** whether one exists.
- **Disabling per project.** The `/mcp` toggle records the choice per project in `~/.claude.json`: `disabledMcpServers` covers user, plugin and organization servers **and claude.ai connectors**, written under display names such as `claude.ai Slack`. `disableClaudeAiConnectors: true` (any settings scope) or `ENABLE_CLAUDEAI_MCP_SERVERS=false` turns off all fetched connectors. `disabledMcpjsonServers` rejects `.mcp.json` servers [D-mcp]. `enabledPlugins` turns plugins on or off per scope [D-settings].
- I found no setting that hides the agent listing (~10k chars measured) [D-settings index]. **Unverified.**

**Applies to this plugin?** Only as Commander-side advice (Recommendation 8). The plugin can't change the user's connectors. The ~150 Higgsfield tool names are the largest part of the deferred list in the measured session.

### 1d. Subagents and cheaper models

- A subagent "does that work in its own context and returns only the summary". It "doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read" [D-sub].
- `model` in agent frontmatter: `sonnet`, `opus`, `haiku`, `fable`, a full ID, or `inherit`. Resolution order: per-invocation `model` parameter → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → the main model. `effort` frontmatter overrides the session effort [D-sub]. The in-session Agent tool accepts `model: sonnet | opus | haiku | fable` per call [T-Agent].
- Plugins can ship agents (`my-plugin:agent-name`). Plugin agents ignore `hooks`, `mcpServers` and `permissionMode` [D-sub].
- **Cache and latency.** A subagent's first request doesn't read the parent's cache, and subagents get a 5-minute TTL by default. A fork reads the parent's cache [D-cache]. "A subagent that isn't a fork starts fresh and may need time to gather context" [D-sub]. Subagent requests count toward the same limits [D-sub].
- The `general-purpose` agent has all tools, including `Artifact` and `ArtifactData`. `Explore` and `Plan` exclude them [T-Agent agent-type list]. A subagent can't hold an artifact watch [T-Comments].

**Applies to this plugin?** Yes, for the dashboard publish (Recommendation 3). The setup skill already delegates to a `general-purpose` subagent with no `model` [Repo setup SKILL.md step 1]. Adding `model: "haiku"` is a one-word change. **Inference:** reading and publishing a fixed file is a mechanical task that fits Haiku. Test it, since the publish must pass the exact title/capabilities/pin arguments. The per-turn tracker conversation (Hebrew judgment, extraction from free text) should stay on the session model. Moving it to a subagent would lose conversation history and rebuild a fresh prefix per call [D-sub], [D-cache].

### 1e. Hooks as context injection

- Plain stdout or `additionalContext` from `SessionStart` and `UserPromptSubmit` enters context as a system reminder. Each string is capped at **10,000 characters**. Over that, Claude Code saves it to a file and passes a 2,000-character preview, and "doesn't ask Claude to read the file" [D-hooks].
- `SessionStart` matchers: `startup`, `resume`, `clear`, `compact`, `fork`. `UserPromptSubmit` "has no matcher support and always fires", with a 30 s default timeout [D-hooks]. Since 2.1.299, `UserPromptSubmit` hooks run before a skill expands [D-changelog].
- Plugins ship hooks in `hooks/hooks.json`. They merge with user and project hooks [D-hooks] and fire whenever the plugin is loaded [plugin-packaging.md].
- `PreToolUse` can return `updatedInput` and `permissionDecision` (`allow`/`deny`/`ask`/`defer`). `PostToolUse` can return `updatedToolOutput`, which "works for all tools" including built-ins, but "only changes what Claude sees" [D-hooks].
- Hook handler types are `command`, `http`, `mcp_tool`, `prompt` and `agent` [D-hooks]. `mcp_tool` calls an MCP server's tool. Nothing documents a hook calling a built-in tool such as `ArtifactData`. **Unverified** that it's impossible, but there is no documented route.

**Cost relative to skills (inference):** hooks fire for every session or prompt, including the Commander's non-tracker work, and are capped at 10k characters. Skills load only when used and append cache-safely. Hooks are the wrong carrier for the tracker's instructions (Recommendation 9). They are useful for small jobs: a `compact` reminder to re-run `boot` (Recommendation 6), clearing a session marker (Recommendation 4), and auto-allowing the plugin's own commands (Recommendation 7).

### 1f. Output styles, effort, thinking, compaction, `/context`

- **Output styles**: a mid-session switch is delivered as a message and keeps the cache [D-cache]. This doesn't apply here: the tracker's reply style already lives in the skill.
- **Effort**: levels `low`…`max`. The default is `medium` on Opus/Sonnet/Haiku 5.5. "Lower effort is faster and cheaper for straightforward tasks." Skill and agent frontmatter `effort` overrides it for that turn or agent. Thinking can't be turned off on the 5.5 models, and thinking tokens bill as output [D-model], [D-costs]. A per-skill effort change is cache-safe on 5.5 models with a subscription [D-cache]. **Inference:** `/dashboard` (one `open` call) is a safe `effort: low` candidate. `/status` and `/brief` need an eval first, because lower effort "returned a starting point sooner" and verified less [D-model].
- **Compaction**: `/compact` re-reads the conversation at the cached rate while the cache is warm. "`/clear` costs nothing." Run it at natural breaks. Idle compaction runs on long conversations left idle near the 1h TTL [D-cache], [D-costs]. Auto-compact threshold: `/autocompact`, `autoCompactWindow`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW` [D-model]. After compaction, invoked skills are re-attached within 5k tokens each [D-ctx].
- **`/context`** gives a live breakdown by category. The Skills row reports the listing after the budget is applied [D-ctx], [D-skills]. `/usage` gives attribution by skill, plugin and MCP server, plus cache stats [D-costs].

### 1g. MCP server vs. CLI-in-Bash

- Docs: "Prefer CLI tools when available… still more context-efficient than MCP servers because they don't add any per-tool listing" [D-costs].
- A plugin MCP server adds deferred tool names plus server instructions (≤4,096 chars) to every session, needs a ToolSearch call before first use, and appears as `mcp__plugin_<plugin>_<server>__<tool>` [D-mcp]. MCP results over 50,000 characters are saved to a file. There is a warning at 10,000 tokens and a 25,000-token default cap [D-mcp].
- The Bash CLI has a ~30k-character inline ceiling [D-tools], no listing cost, and permission is pre-approved only in the skill's invoking turn [D-skills].

**Inference:** an MCP server would give typed inputs (no heredoc payload rule) but can't reach the artifact database (Q2). The CLI stays the better home for the logic.

## 2. Artifact / ArtifactData specifics for moving logic into the CLI

### What the tool offers [T-Data]

- **Reads**: `get`, `list`, `query` (`where` ≤10 clauses, `order_by`, `limit` 1–1000 default 100, `cursor`), `profiles`.
- **`out_dir`** on `get`/`list`/`query`: "each returned document is written as pretty-printed JSON to `<out_dir>/<collection path>/<doc_id>.json` (directories created as needed) and the result lists the files instead of the document contents — use it for large documents or many of them". Since 2.1.269, reads saved into the session scratchpad don't ask for working-folder approval [D-changelog]. The plugin's reference already says "never under `~/.claude`" [Repo `store/artifact/core.md`].
- **Writes**: `set` and `update` take `data` **or** `file_path` ("a local JSON file whose top-level object is sent as the document, so a large document need not pass through the conversation"). Other writes are `str_replace` on one string field, `delete`, and `batch`.
- **`batch` from files: yes, per entry.** `writes` holds 1–50 entries `{op, collection, doc_id, data | file_path, if_version}`. Each entry may name its own `file_path` instead of inline `data` [T-Data schema]. The `writes` array itself is inline. There is no "whole batch from one file" option. Each entry is ~50–80 characters of output.
- **Limits**: 1–50 writes per batch, each document at most once, whole batch body ≤1 MiB. Every write to an existing document needs `if_version`. "If any pinned document has changed since, or an existing document's entry carries no pin, the whole batch writes nothing." A batch with no pinned entry applies "in order one at a time (the result says which)" [T-Data]. Documents ≤256 KiB, ≤25,000 documents per database, and no indexes (queries scan) [R-art §3]. A write refused at the size limit now states the limit (2.1.288) [D-changelog].
- `update` removes a field with `{"__delete__": true}` (2.1.273) [T-Data], [D-changelog].

### Can a script call the database without the model?

**No documented way.**
- `ArtifactData` is a built-in Claude Code tool that "reads and writes it as the user" [T-Data].
- The only documented artifact HTTP API is the Compliance API (list, get version content, delete artifacts), not the db [D-art].
- Artifacts are "Off by default … when you run Claude Code with `-p` from your own terminal or scripts" and in the Agent SDK [D-art].
- Hooks call MCP tools, not built-ins [D-hooks].

**Unverified** whether any undocumented route exists. Don't build on one.

**Inference:** the model has to make the read and write calls, but it doesn't have to see the data. With `out_dir` on reads and `file_path` on writes, the only things passing through the model are file lists, a short CLI summary, and the batch's entry list.

### How the CLI move would fit (inference, grounded in the repo)

- `lib/docs.mjs` already "Emulates the artifact database's write rules": create-refused-if-exists, `if_version` pins, 50 writes / 1 MiB, all-or-nothing when pinned. It stores documents at `<root>/<collection path>/<doc id>.json` holding `{version, data}` [Repo]. That is the same path scheme `out_dir` writes. If the `out_dir` files carry the document's `version` (**Unverified**), a thin adapter lets `store.mjs` run unchanged over a snapshot directory and emit a write list instead of applying it.
- **Round trips for a log turn, artifact backend.**
  - Today, from the tracker's Start and `store/artifact/record.md`: ToolSearch + route; connect, resume and read; card and assessment queries plus display-safe queries; Entry create; one batch per Trainee; Entry `done`; alerts; reply. That is ~7–9 requests.
  - Proposed:
    1. ToolSearch (first tracker turn of a session only) plus `date`.
    2. Snapshot reads with `out_dir` in parallel: `meta/*`, `commander/*`, `playbook`, `teams`, `trainees`, and for the Trainees the message names, their `assessments`/`evidence`/`sensitive` queries.
    3. `student-tracker-store plan` with the model's extraction on stdin. It runs the checks, writes the document files, and prints the alerts plus a ready entry list.
    4. One `batch` with `file_path` entries (Entry + records + pinned card updates; ≤50 writes ⇒ atomic).
    5. Reply.
  
  The `writing`/`pending` resume protocol (spec "Write protocol") is then needed only for Entries over 50 writes. That is a spec/ADR-level change to record before building it.
- **Output tokens.** Today the model writes every record and card field as inline `data`, and `entries/<eid>.pending` repeats all records [Repo `store/artifact/record.md` step 2]. With `file_path`, these become CLI-written files. Output is $20/MTok on Opus 5.5 versus a $8 1h cache write for the same text as input [D-price], and output is generated token by token.
- **Instruction volume.** `store/artifact/*.md` is ~3,200 words and `store/*.md` ~2,850 words [Repo `wc -w`]. Most of the artifact half (paths, pins, batch rules, card build, display-safe procedure) would become code. The model would keep only "call these reads with `out_dir`, run `plan`, send the batch it prints, and on a version conflict re-read and re-run". This matches the best-practice guidance: "Prefer scripts for deterministic operations", and scripts "Save tokens (no need to include code in context)… Ensure consistency" [D-bp]. [Eng-codeexec] reports 150,000 → 2,000 tokens for the same pattern of keeping intermediate data out of the model.
- **Publishing.** The Artifact tool reads "the whole file before publishing it" when Claude didn't write it, and "never distributes what it has not seen" [T-Artifact]. Script, style, data, font and image files of another artifact can be copied server-side through `files: {"app.js": {"artifact": "<url>", "path": "app.js"}}`, but "an HTML or XML document does not" copy that way [T-Artifact]. **Inference:** split the dashboard into a small HTML shell plus `app.js`/`style.css`, so the next Cycle's publish copies the scripts from the previous Cycle without reading them. The first-ever publish still reads everything. **Unverified** whether a server-side copy is exempt from the read-before-publish rule; the tool text says "nothing is downloaded".

## 3. Anthropic's skill-authoring guidance on concision

- "The context window is a public good." "Default assumption: Claude is already very smart. Only add context Claude doesn't already have." Ask of each paragraph: "Does this paragraph justify its token cost?" [D-bp]
- "Keep the `SKILL.md` body under 500 lines for optimal performance." Split into reference files near the limit [D-bp], [D-skills]. The Claude Code page adds "State what to do rather than narrating how or why" [D-skills].
- **What goes where.** SKILL.md is "an overview that points Claude to detailed materials as needed". Organize references by domain so Claude loads only the relevant one. "Keep references one level deep from SKILL.md". Give reference files over 100 lines a table of contents [D-bp].
- **Scripts over prose for fragile, deterministic work.** These are "Low freedom" tasks: "Operations are fragile and error-prone… Consistency is critical… A specific sequence must be followed". "Prefer scripts for deterministic operations". Utility scripts "are more reliable than generated code, save tokens, save time". "Solve, don't punt": handle errors in the script. Use "plan-validate-execute" with a verifiable intermediate file for "batch operations, destructive changes, complex validation rules" [D-bp].
- Description: ≤1,024 characters, third person, what + when [D-bp]. Claude Code's listing cap is 1,536 characters for `description` + `when_to_use` [D-skills].
- Test with every model you plan to use (Haiku may need more detail, Opus less) [D-bp].

**Inference for this plugin:**
- The `boot` design already follows progressive disclosure by route.
- The `references/<route>.md` → `store/<family>.md` → `store/artifact/<family>.md` chain is two levels deep. `boot` flattens it, which avoids the partial-read risk the guide warns about.
- The biggest deviation from the guidance is the artifact protocol: a low-freedom, version-pinned write sequence written as prose for the model to execute. The guide's answer to that is a script (Recommendation 1).

## Open questions

1. **Does `out_dir` save the document's `version` in the JSON file**, or only the data, with the version in the result listing? This decides whether `store.mjs` can pin writes from the snapshot alone. Test with one `get` with `out_dir` on a throwaway artifact.
2. **Did `/brief` hit the ~30k-character inline ceiling** in the measured session? Check the `/brief` skill message for a persisted-output path or preview. Does `bashOutputMaxChars` apply to `!` injection exactly as to the Bash tool? [D-skills] says the Bash ceiling applies, but the setting isn't named there.
3. **Is a server-side `files: {artifact, path}` copy exempt** from "read before publishing"? Does an `asset: true` upload need a read?
4. **Is a pinned batch atomic on the production server today?** The description says "where the server supports it", and a result says which mode applied [T-Data]. If it isn't atomic, the single-batch Entry still needs the resume protocol.
5. **Can a plugin `PreToolUse` hook auto-allow `ArtifactData` writes**, and should it? Writes show a permission card with document count and audience [R-art §2]. Auto-allowing reads only may be the safe line.
6. **Haiku for the publish subagent**: does it reliably pass `capabilities: {"db": {}, "user": {}}` and `pin: true`? It needs an eval.
7. **`effort: low` on `/status` and `/brief`**: does quality hold in Hebrew? It needs the evals in `plugins/student-tracker/evals/`.
8. **Tokens per character for the Hebrew-heavy boot text.** The measurements here are in characters and words. `/context` before and after a `/brief` would give real token counts.
9. **Agent-listing size (~10k chars)** in the measured session: I found no setting to trim it [D-settings index]. **Unverified.**
