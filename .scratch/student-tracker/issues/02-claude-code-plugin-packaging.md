# How is a Claude Code plugin packaged, namespaced, configured and distributed?

Type: research
Labels: wayfinder:research
Status: resolved
Blocked by:

## Question

What does the Claude Code plugin system offer for `student-tracker`?

- Plugin layout and manifest: commands, skills, agents, hooks, MCP servers; how `/student-tracker:setup` namespacing arises.
- Distribution via a public GitHub marketplace: `marketplace.json`, install and update flow for a non-expert Commander.
- Per-user configuration/state: where a plugin can persist small per-Commander settings (artifact URL, Commander name, Talk cadence) across sessions and machines; plugin settings conventions.
- Skills vs commands: auto-triggering a skill on free-text updates ("talked with Noa today…") vs explicit slash commands.
- Portability note: how close Claude Code skills are to the cross-agent Agent Skills (`SKILL.md`) standard used by Codex/Gemini CLI, so we know what to keep neutral (no export design).

Output: findings with sources in `.scratch/student-tracker/research/plugin-packaging.md`.

## Answer

- Layout: `.claude-plugin/plugin.json` (optional; only `name` required) plus root-level `skills/<name>/SKILL.md`, `agents/`, `hooks/hooks.json`, `.mcp.json`. Commands are merged into skills; prefer `skills/`. A plugin-root `CLAUDE.md` is ignored.
- Namespacing: every component is prefixed with the manifest `name`, so `skills/setup/SKILL.md` in `student-tracker` becomes `/student-tracker:setup`. Bare `/setup` also works unless another command already takes that name. Keep the marketplace entry name and the manifest name both `student-tracker`.
- Distribution: one public GitHub repo with `.claude-plugin/marketplace.json` and a relative-path entry (`"./…"`). Commanders run `/plugin marketplace add owner/repo`, then `/plugin install student-tracker@<mkt>` at user scope, then `/student-tracker:setup`. Needs `git` and a claude.ai login (for artifacts).
- Updates: auto-update is OFF by default for third-party marketplaces. Each Commander must enable it in `/plugin` → Marketplaces, or update manually. Setting `version` pins users until the string changes; omitting it makes them track commits.
- Per-user state on one machine: `userConfig` (dialog-prompted; values go to `pluginConfigs` in `~/.claude/settings.json`, secrets to the OS keychain) or files in `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`). Both survive updates and both are deleted on uninstall.
- Across machines: no plugin-local store syncs. Only the claude.ai account follows the Commander (artifacts are listed from the account). So durable settings (Commander name, Talk cadence) belong in the artifact database. The machine keeps only a cached artifact URL, which the official `project-artifact` plugin also uses as its pattern.
- Skills auto-trigger from their `description`. `disable-model-invocation: true` makes a skill user-only (fits `setup`). A default skill can catch free-text updates.
- Portability: Claude Code skills follow agentskills.io. Keep `name` = directory name (lowercase-hyphen) and `description` ≤1024 chars, and use only the six spec fields where possible. Treat invocation flags, `${CLAUDE_PLUGIN_*}`, `${user_config.*}`, `` !`cmd` ``, hooks and the Artifact tool as the Claude-only layer.
- Open: whether `userConfig` values sync for claude.ai-synced plugins, and whether a skill can list artifacts or use the artifact DB to recover the URL on a new machine (ticket 01).

Full findings and sources: [research/plugin-packaging.md](../research/plugin-packaging.md)
