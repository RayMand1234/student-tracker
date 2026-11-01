# Research: Claude Code plugin packaging, namespacing, configuration and distribution

Ticket: [02-claude-code-plugin-packaging](../issues/02-claude-code-plugin-packaging.md)
Researched: 2026-10-29, against the live docs at code.claude.com (current Claude Code is in the v2.1.29x range, judging by the version notes in those docs).

Primary sources (cited inline by short name):

- **[manifest]** Plugin manifest reference: https://code.claude.com/docs/en/plugins-reference (served as `plugins/manifest-reference`)
- **[components]** Add components to a plugin: https://code.claude.com/docs/en/plugins/components
- **[loading]** Plugin loading reference: https://code.claude.com/docs/en/plugins/loading
- **[install]** Install and manage plugins: https://code.claude.com/docs/en/plugins/install
- **[cli]** Plugin commands reference: https://code.claude.com/docs/en/plugins/cli-reference
- **[mkt-ref]** Marketplace reference: https://code.claude.com/docs/en/plugins/marketplace-reference
- **[host]** Host and maintain a marketplace: https://code.claude.com/docs/en/plugins/host-marketplace
- **[settings]** Settings reference: https://code.claude.com/docs/en/settings-reference (`#pluginconfigs`, `#enabledplugins`, `#extraknownmarketplaces`, `#syncclaudeaiplugins`)
- **[skills]** Skills: https://code.claude.com/docs/en/skills
- **[artifacts]** Share session output as artifacts: https://code.claude.com/docs/en/artifacts
- **[spec]** Agent Skills specification: https://agentskills.io/specification
- **[codex]** OpenAI Codex skills (developers.openai.com/codex/skills, which now redirects to https://learn.chatgpt.com/docs/build-skills)
- **[gemini]** Gemini CLI skills: https://geminicli.com/docs/cli/skills/
- **[local]** Read-only examples under `/Users/raymandelvei/.claude/plugins/marketplaces/claude-plugins-official/`, plus this machine's `~/.claude/plugins/` and `~/.claude/settings.json`

---

## 1. Layout and manifest (confirmed)

- The manifest is `.claude-plugin/plugin.json` under the plugin root. It is **optional**. Without one, Claude Code loads components from the standard layout and takes the name from the marketplace entry. `name` is the only required field. [manifest]
- Every other file goes at the plugin root, not inside `.claude-plugin/`. [manifest]
- Default locations [manifest, "Standard layout"]:
  - `skills/<name>/SKILL.md` for skills
  - `commands/*.md` for commands ("Prefer `skills/` for new plugins")
  - `agents/*.md` for agents
  - `hooks/hooks.json` for hooks
  - `.mcp.json` for MCP servers
  - `.lsp.json` for LSP servers
  - `output-styles/`, `themes/`, `monitors/monitors.json`, `workflows/`
  - `bin/` for executables (put on the Bash tool's `PATH`)
  - `settings.json`, where only the `agent` and `subagentStatusLine` keys take effect
- A `CLAUDE.md` at the plugin root is **not loaded**, and `claude plugin validate` warns about it. Instructions that should load into context must go in a skill. [manifest], [components]
- How manifest component keys combine with the default folders [manifest, "How each key combines with its default location"]:
  - `commands`, `agents` and `outputStyles` *replace* the default scan.
  - `skills` *adds* to it.
  - `hooks`, `mcpServers` and `lspServers` *merge* with it.
  - (The local `plugin-dev/skills/plugin-structure/SKILL.md` says custom paths "supplement" defaults for all keys. That is outdated for `commands` and `agents`.)
- `claude plugin validate ./plugin` is the authoritative check, and `--strict` turns warnings into failures for CI. [manifest]
- `version` is optional. Setting it **pins users to that version until you change the string**. If you omit it, the version becomes the git commit SHA, so users track commits. [manifest], [loading, "How Claude Code computes the version"]
- Local evidence: the official plugins use minimal manifests with only `name`, `version`, `description` and `author` (for example `plugins/ralph-loop/.claude-plugin/plugin.json` and `plugins/plugin-dev/.claude-plugin/plugin.json`). `plugins/project-artifact` is a skills-only plugin. [local]

## 2. Namespacing: how `/student-tracker:setup` arises (confirmed)

- "Claude Code namespaces every component under [the manifest `name`]". An agent `reviewer` in plugin `deploy-tools` appears as `deploy-tools:reviewer`. [manifest, `name`]
- A skill command is named `/<plugin>:<directory>`. So `skills/setup/SKILL.md` in a plugin named `student-tracker` becomes **`/student-tracker:setup`**. A frontmatter `name` replaces the last segment. [components, "Skills"], [skills, "How a skill gets its command name"]
- **Surprise:** "The bare `/fancy` also invokes the skill unless another command already uses that name." So `/setup` might also work, unless something else already claims that name. [skills]
- Commands: `commands/<file>.md` becomes `/<plugin>:<file>`, and a subdirectory adds a segment (`/plugin:db:migrate`). [components, "Commands"]
- Other namespaced names [components]:
  - MCP server: `plugin:<plugin>:<server>`
  - MCP tools: `mcp__plugin_<plugin>_<server>__<tool>`
  - Agents: `<plugin>:<name>`
- A plugin has **two names** [loading, "Entry name and manifest name"]:
  - The marketplace **entry name** is the install and enable key. It appears in `enabledPlugins` and `pluginConfigs` and names the cache directory.
  - The **manifest name** is the component namespace.
  - Keeping both as `student-tracker` avoids confusion.
- Renaming breaks installs unless `marketplace.json` has a `renames` map. To change the visible label safely, use `displayName`. [host, "Rename or remove a plugin"]
- Reserved names [manifest], [mkt-ref, "Reserved names"]:
  - Plugin names starting with `claude-`, `anthropic-` and similar are errors.
  - Marketplace names have a long reserved list, plus the `<owner>-<repo>` download-folder rule and a `claudeai-` prefix rule.
  - `student-tracker` collides with none of these.

## 3. Skills vs commands; auto-triggering on free text (confirmed)

- "Custom commands have been merged into skills." A `commands/deploy.md` and a `skills/deploy/SKILL.md` both create `/deploy` and behave the same. Commands are "the older format". [skills], [components]
- Who invokes a skill [skills, "Control who invokes a skill"]:

  | Frontmatter | User `/name` | Claude auto-invokes | Description in context |
  |---|---|---|---|
  | (default) | yes | yes | always |
  | `disable-model-invocation: true` | yes | no | no |
  | `user-invocable: false` | no (hidden from `/` menu) | yes | always |

- Auto-invocation works by description matching. "Claude reads every skill's `description`, and when what the user asks for matches it ... Claude loads the skill's instructions". [components]
  - The combined `description` + `when_to_use` text is truncated at 1,536 characters in the listing. [skills]
- Implication for student-tracker:
  - A **default** skill whose description names free-text update patterns (in Hebrew and English, e.g. "talked with Noa today…") can auto-trigger.
  - `setup` should probably be `disable-model-invocation: true`, since it has side effects and only the user should start it.
  - These are design inputs for ticket 07, not decisions.
- Useful skill substitutions [skills]:
  - `$ARGUMENTS`, `$N` and named `arguments`
  - `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` (the last two in plugin skills only)
  - `${user_config.KEY}` for non-sensitive values [manifest]
  - `` !`command` `` dynamic context injection, which runs before the skill is sent. A failing command aborts the whole skill. Admins can disable it with `disableSkillShellExecution`.
- Hooks fire whenever the plugin is loaded, not only when its skills are used. [components, "When plugin hooks fire"]

## 4. Per-user configuration and state: where it can persist

### 4a. Confirmed mechanisms

| Mechanism | Where it lives | Survives sessions | Survives plugin updates | Survives uninstall | Follows the user to another machine |
|---|---|---|---|---|---|
| **`userConfig`** (manifest-declared options, prompted by a dialog) | Non-sensitive values go to `pluginConfigs["<name>@<marketplace>"].options` in **`~/.claude/settings.json`** (user scope only; project and local entries are ignored). Sensitive values go to the OS secure credential store. [manifest, "Where values are stored"], [settings `#pluginconfigs`] | yes | yes | no: uninstall from the last scope deletes "stored options and secrets" [cli, "What an uninstall deletes and keeps"] | **no** (machine-local file) |
| **`${CLAUDE_PLUGIN_DATA}`** | `~/.claude/plugins/data/<id>/`, where `<id>` is `name@marketplace` with other characters replaced by `-`, e.g. `student-tracker-<marketplace>`. Created on first reference. [manifest, "Environment variables"], [components, "Reference plugin paths and store data"] | yes | **yes** ("kept across plugin updates") | no: deleted when uninstalled from the last scope, unless `--keep-data` [cli] | **no** (machine-local) |
| `${CLAUDE_PLUGIN_ROOT}` | `~/.claude/plugins/cache/<mkt>/<plugin>/<version>/` | n/a | **no**: the path changes with each version, and old versions are swept 14 days later. "don't write state there". [manifest], [loading, "Cleanup of previous versions"] | no | no |
| `.claude/<plugin>.local.md` pattern (from the local `plugin-dev` skill) | Inside the **project** directory | yes | yes | yes | no, and it is per-project. Suits a per-repo plugin, not a Commander's personal tool. [local: `plugins/plugin-dev/skills/plugin-settings/SKILL.md`] |
| **claude.ai account** (artifacts) | Anthropic-hosted, tied to the claude.ai login | yes | yes | yes | **yes**: "Claude Code reads the list from your claude.ai account, so `/artifacts` works in a new session"; the gallery is at claude.ai/code/artifacts [artifacts, "Find an artifact again"] |

How a plugin reads and writes these values:

- **`userConfig`** [manifest], [components], [cli]:
  - Declare options in `plugin.json` with `type` ∈ string, number, boolean, directory, file, plus `title`, `description`, and optionally `default`, `required`, `options` (a picker; needs v2.1.271 or later) and `sensitive`.
  - The dialog opens on install or enable in `/plugin`, or on demand with `/plugin configure <plugin>@<mkt>`. The shell command `claude plugin install` **never prompts**. Values can be set there with `--config KEY=VALUE`, or later with `claude plugin configure <id> --values-stdin` (v2.1.285 or later). That command prints "Configuration saved. Restart Claude Code to apply it."
  - Skills and agents read values as `${user_config.KEY}`, substituted when the content loads. Sensitive values become a placeholder there. Hooks read `CLAUDE_PLUGIN_OPTION_<KEY>` instead.
  - Each non-sensitive option also appears as a row in `/config` (v2.1.269 or later).
- **`${CLAUDE_PLUGIN_DATA}`**: these variables are **not** in the Bash tool's environment. Skill content must use the inline `${CLAUDE_PLUGIN_DATA}` reference, which Claude Code substitutes when it loads the skill. [manifest, "Where each variable resolves"]
- **Precedent:** the official `project-artifact` plugin solves this exact problem: a per-user config holding an artifact URL. [local: `plugins/project-artifact/skills/project-artifact/SKILL.md`]
  - It stores `${CLAUDE_PLUGIN_DATA}/artifacts/<slug>/config.md` with the minted URL.
  - It writes the config after the first publish.
  - It says plainly: "It is machine-local: a user who wants a config to follow them across machines can keep it in their dotfiles".
  - On a new machine, it recovers from the URL by fetching the artifact.

### 4b. Answer: small per-user state across sessions *and* machines

- **Across sessions on one machine**, either `userConfig`/`pluginConfigs` or a small file in `${CLAUDE_PLUGIN_DATA}` works.
  - Both survive updates.
  - Both are deleted on uninstall (unless `--keep-data` for the data dir).
- **Across machines, no plugin-local mechanism syncs.** Both `~/.claude/settings.json` and `~/.claude/plugins/data/` are per machine.
  - The only cross-machine sync Claude Code documents is for **plugins themselves**: plugins turned on for the claude.ai account load as `<name>@synced`. [loading, "Plugins synced from claude.ai"], [install, "Plugins from your claude.ai account"]
  - Plugins installed with `/plugin install` are "not added to your claude.ai account". [install]
  - The docs never say that `pluginConfigs` values travel with synced plugins (see Unknowns).
- **So the only store that follows the Commander is their claude.ai account**: the artifact and its data, which matches ADR 0001.
  - Practical shape, an inference to settle in ticket 06/07:
    - Keep the Commander name, Talk cadence and the rest *in the artifact's database*.
    - Keep only a **cache of the artifact URL** on the machine, in `${CLAUDE_PLUGIN_DATA}` (as `project-artifact` does) or in a `userConfig` string.
    - On a machine with no cached URL, setup recovers it from the account's artifact list, or asks the Commander to paste the URL.
  - Of the two machine-local options, `${CLAUDE_PLUGIN_DATA}` is easier to *write from a skill* (a plain file write). `userConfig` is designed for human entry in a dialog, and writing it programmatically needs `claude plugin configure … --values-stdin` plus a restart.

## 5. Distribution via a public GitHub marketplace (confirmed)

- The marketplace file lives at `.claude-plugin/marketplace.json` in the repo. Required fields are `name`, `owner.name` and `plugins[]`, and each entry needs `name` and `source`. [mkt-ref]
- **Single-repo setup:** one public repo can hold both the catalog and the plugin.
  - The entry source can be a relative path such as `"./plugins/student-tracker"`, or `"."` for the repo root. Paths resolve from the marketplace root.
  - Relative paths work because a `github` marketplace source clones the whole repo. [mkt-ref, "Relative path plugin source"]
  - Relative-path entries also show `plugin.json` details before install, and with no `version` field the version comes from the commit SHA. [mkt-ref, "Display fields"], [loading]
  - Local evidence: the official catalog has 315 entries, 53 of which use relative-path string sources (the rest are `url` or `git-subdir`). [local: `.claude-plugin/marketplace.json`]
- Commander install flow (terminal) [install], [host]:
  1. `/plugin marketplace add <owner>/<repo>` prints `Successfully added marketplace: <name>`. The `<name>` comes from `marketplace.json`, not from the repo name.
  2. `/plugin install student-tracker@<marketplace-name>` opens a details pane. Choose **"Install for you (user scope)"**. The summary then says "Plugin is now active." or `Run /reload-plugins to apply.`
  3. Run `/student-tracker:setup`.
  - One-step alternatives: `/plugin install student-tracker --marketplace <owner>/<repo>` in a session (v2.1.275 or later), or `claude plugin install student-tracker --marketplace <owner>/<repo>` in the shell (v2.1.292 or later).
  - The desktop app's Code tab and the VS Code extension have GUI equivalents and **share the same settings files** on one machine. [install]
- Prerequisites the Commander needs [host], [artifacts]:
  - **`git`** on the machine, for a GitHub marketplace.
  - A **claude.ai login** (Pro, Max, Team or Enterprise), for artifacts. Sessions using an API key, Bedrock, Vertex or Foundry, `-p` mode, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` can't publish.
  - For a public repo, `owner/repo` shorthand probes SSH and falls back to HTTPS.
- Updates [install, "Keep plugins updated"], [loading, "When auto-update runs"], [host, "Keep users up to date"]:
  - **Auto-update is off by default for third-party marketplaces**, and `marketplace.json` has no field to turn it on.
  - Each Commander must enable it under `/plugin` → Marketplaces → **Enable auto-update**. Otherwise they run `/plugin marketplace update <name>` or `claude plugin update student-tracker@<mkt>`.
  - When auto-update is on, it runs in the background after the first message, with a random delay of up to 10 minutes. New versions apply after `/reload-plugins` or on the next launch.
- Releasing: either bump `version` on every release, or omit it in both `plugin.json` and the entry so users track commits. Setting it in both places triggers a validator warning, and `plugin.json` wins. [host, "Release a new version"]
- Scopes: user scope writes `enabledPlugins` to `~/.claude/settings.json`, project scope to `.claude/settings.json`, and local scope to `.claude/settings.local.json`. A personal tool like this one fits **user scope**. [install, "Choose an install scope"]
- Cloud sessions (claude.ai/code) "don't load the plugins you installed on your own machine". [install]

## 6. Portability note: Agent Skills standard vs Claude Code (confirmed)

- Claude Code docs: "Claude Code skills follow the Agent Skills open standard ... Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection." [skills]
- The portable frontmatter set is exactly `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`. Claude Code accepts all six. [skills], [spec]
- Spec constraints [spec]:
  - `name`: 1–64 characters, lowercase a–z, 0–9 and `-`, no leading, trailing or double hyphens, and it **must match the parent directory name**.
  - `description`: 1–**1024** characters. Claude Code allows 1,536 for `description` + `when_to_use` combined.
  - `metadata` is a string→string map, and `allowed-tools` is experimental.
  - Optional `scripts/`, `references/` and `assets/` directories. Relative file references stay one level deep. Keep `SKILL.md` under 500 lines and under about 5,000 tokens.
- Codex [codex]:
  - Discovery: `.agents/skills` from the working directory up to the repo root, `$HOME/.agents/skills` and `/etc/codex/skills`.
  - Requires `name` and `description`. Optional extras go in `agents/openai.yaml` (UI metadata, invocation policy such as `allow_implicit_invocation: false`, and tool dependencies such as MCP servers).
  - Explicit invocation through `/skills` or a `$` mention. Plugins can bundle skills.
- Gemini CLI [gemini]:
  - Discovery: built-in, then extension, then user (`~/.gemini/skills` or `~/.agents/skills`), then workspace (`.gemini/skills` or `.agents/skills`).
  - It activates through an `activate_skill` tool **with a user consent prompt**, and extensions can bundle skills.
- What to keep neutral, as design inputs and not an export design:
  - Put every behavior in `skills/<name>/SKILL.md` and avoid `commands/`, which is Claude-only and legacy. Keep `name` equal to the directory name, in lowercase-hyphen form. Keep `description` at or under 1024 characters. Use relative `references/`, `scripts/` and `assets/` paths.
  - Treat these as a thin Claude-specific layer that is easy to strip or swap:
    - `disable-model-invocation`, `user-invocable`, `argument-hint`, `arguments`
    - `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PLUGIN_ROOT}` substitutions, `${user_config.*}`, `` !`cmd` `` injection
    - hooks and `userConfig`
  - Namespacing (`plugin:skill`) is Claude Code's. Other agents invoke by bare skill name, so skill names should stand on their own (e.g. `student-tracker-setup` vs `setup`). This is an inference.
  - The Artifact tool and artifact database exist only in Claude Code with a claude.ai login. That makes the storage interface from ADR 0001 the main portability seam. [artifacts]

---

## Unknowns / not confirmed

1. **Do `pluginConfigs` / `userConfig` values sync across machines** for a plugin synced from claude.ai (`@synced`)? The docs describe syncing plugins, not their option values. They're probably not synced, but this isn't confirmed.
2. **Can a skill run `claude plugin configure … --values-stdin` from the Bash tool mid-session?** It is a shell command, so it probably works, but it says to restart before values apply. The docs don't address this.
3. **Artifact database and listing from a skill:** this session's Artifact tool exposes `action: "list"` (title, URL, last-updated) and an `ArtifactData` database. Neither the database nor the list action as a *tool* call is described on the public [artifacts] page, which documents only `/artifacts` and the claude.ai gallery. Ticket 01 should confirm both for URL recovery on a new machine.
4. **Bare `/setup`:** whether another command already claims `setup` in a typical install (which would leave only `/student-tracker:setup`). Untested.
5. **Git-free install for non-technical Commanders:** an `archive` (https zip) plugin source needs no git, but a GitHub-hosted catalog still needs git to add. A hosted `marketplace.json` URL plus an `archive` entry is a documented git-free path [host, "Serve users who have no git-host account"]. Whether a GitHub release or codeload zip URL works as the archive was not tested.
6. Codex and Gemini details came from vendor pages fetched through a summarizer, so treat exact field names (`agents/openai.yaml`, `allow_implicit_invocation`) as needing a re-check at export time.

## Surprises

- The local `plugin-dev` skills (`plugin-settings`, `plugin-structure`) are **behind the docs**:
  - They recommend a per-project `.claude/<plugin>.local.md` and say custom paths always supplement defaults.
  - They don't mention `userConfig`, `pluginConfigs` or `${CLAUDE_PLUGIN_DATA}`, which are now the documented mechanisms.
- Auto-update is **off** for third-party marketplaces, so Commanders who don't turn it on silently stay on old versions.
- `version` in `plugin.json` freezes users on that version until you edit the string, however many commits you push.
- Uninstall deletes the plugin's data directory *and* its stored options and secrets.
- `CLAUDE.md` in a plugin is ignored. Instructions must be skills.
