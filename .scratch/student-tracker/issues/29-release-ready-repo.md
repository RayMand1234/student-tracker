# 29: Release-ready repo

**Spec:** `.scratch/student-tracker/spec.md` (Packaging; Portability; Further Notes → privacy)

**What to build:** A repo another Commander can install from. The README explains install (git required, with a one-line hint per OS), the claude.ai prerequisites, enabling auto-update, the Claude-only layer, and plainly that Team/Enterprise org Owners can reach artifacts through the Compliance API. A final audit confirms prompts stay agent-neutral and no Trainee data is in the repo. Pushing to a public GitHub repo is left to the Commander.

**Blocked by:** 22, 25, 27, 28

**Status:** resolved

- [x] README covers install, prerequisites, auto-update, privacy note, Claude-only layer
- [x] Manifest and marketplace entry consistent; `version` omitted so installs track commits
- [x] Audit: SKILL.md bodies and references name storage operations, not ArtifactData calls, outside the artifact mapping, setup preflight/publish and the dashboard page
- [x] Audit: no Trainee data, scratch notes or local pointers in tracked files
- [ ] All evals and unit tests pass (unit tests pass; the full eval sweep is run by the orchestrator after the review fixes merge)

## Comments

**2026-10-31 — implemented** (`README.md`, `.gitignore`, `plugins/student-tracker/.claude-plugin/plugin.json`, `skills/tracker/references/{playbook,storage-artifact}.md`, `test/release.test.mjs`). Built on branch `ticket-29-release-ready-repo` off `integration/v1`.

What the repo now has: a root `README.md` for another Commander. It covers what the plugin does; prerequisites (git with a one-line install per OS, a recent Claude Code, a paid claude.ai plan, `/login` with that account, artifacts allowed by org policy and `enableArtifact`, no `-p`); the two `/plugin` commands, then `/student-tracker:setup`; how to turn on auto-update (`/plugin` → Marketplaces → student-tracker → Enable auto-update; it is off by default for third-party marketplaces) and how to update by hand; Hebrew starter phrases and shortcuts; new Cycle and new machine; where data lives and who can see it; the Claude-only layer; repo layout; development. The privacy section says plainly that on Team/Enterprise org Owners can list, read and delete artifacts through the Compliance API and set retention that deletes them, and that sensitive details are stored, only never shown.

Audit results:

- **Agent-neutral prompts.** `tracker` and the shortcut SKILL.md bodies and every reference except `storage-artifact.md` name storage operations only: no `ArtifactData`, Artifact tool, ToolSearch, `if_version` or `out_dir`. `setup` mentions the Artifact tools only in step 1's preflight, step 6's publish and the step-7 unpin of the previous Cycle (part of its publish/lifecycle). `allowed-tools: ArtifactData` stays in frontmatter, as the spec says. Now guarded by `test/release.test.mjs`.
- **Found and fixed:** `playbook.md` and `storage-artifact.md` (twice) pointed at `${CLAUDE_PLUGIN_ROOT}/data/playbook.json`. Claude Code substitutes `${CLAUDE_PLUGIN_*}` only in SKILL.md text, not in files read later, so these reached the agent literally. They now say "`data/playbook.json` under the plugin root"; the `tracker` and `setup` SKILL.md files give the plugin root. A test keeps `${CLAUDE_PLUGIN_*}` out of reference files.
- **Manifest and marketplace:** same name (`student-tracker`), same description, relative-path source `./plugins/student-tracker`, no `version` in either (installs track commits). Added `homepage` and `repository` to `plugin.json`. `claude plugin validate` passes on both; its only warning is the intended missing `version`.
- **No Trainee data, scratch notes or local pointers tracked.** Every Trainee name in tracked files (נועה, דני, מאיה, נוי, גל…) is an invented example from the spec, used in tests, evals, prompts and tickets. The sensitive-sounding fixtures are synthetic. Nothing tracked is a pointer file, store data, eval output or a machine path. The tracked `.scratch/student-tracker/issues/` (12–27, and this one) are kept as the project's design record. Two of them (13, 27) link to private claude.ai artifacts: a test page with sample data and the Playbook review page. Only the owner can open those, so they are left as they are. `.gitignore` now covers `.DS_Store`, editors, `node_modules/`, `.claude/settings.local.json`, `.claude/worktrees/`, `cycles.json`, local-backend stores, and dashboard previews and screenshots at the root. `git ls-files -ci --exclude-standard` is empty.

Decisions taken while building (agent-decided, veto any):

- **README at the repo root, not in the plugin folder.** A GitHub visitor sees it first, and the validator accepts a root README for a plugin in a sub-folder.
- The README states a Claude Code floor of "a recent version (built and tested on 2.1.31x)" instead of a minimum. The real minimum for `ArtifactData` is still unknown, and setup's preflight catches an old one.
- No `LICENSE` added. Choosing a license is the Commander's call. Marketplace installs work without one; only a submission to Anthropic's plugin directory requires it (validator `LICENSE_MISSING`). Same for a plugin icon (directory listing only).
- Development needs Node.js 22+: `npm test` passes a glob to `node --test`.

Not done / to raise:

- **Pushing to GitHub** is left to the Commander. The README's install commands assume `RayMand1234/student-tracker` and the marketplace name `student-tracker`.
- **Only part of the design record is tracked.** In the main checkout, `spec.md`, `map.md`, tickets 01–11 and 28, `research/`, `prototypes/`, `GLOSSARY.md`, `docs/` and `CLAUDE.md` are untracked; only tickets 12–27 are committed. They were not added here. Committing them on a branch would clash with the untracked copies when the branch is merged in the main checkout. If the Commander wants them public, commit them from the main checkout. They hold only invented names (`docs/reference/trainee-mentoring/` is the reference skill), but read them once before pushing.
- `marketplace.json` `owner.name` and `plugin.json` `author.name` are "raymandelvei". Change them if the public name should be different.

Tests: 271 unit tests (21 new in `test/release.test.mjs`: marketplace/manifest agreement with no version; one agent-neutrality check per prompt file (`tracker`, the three shortcuts, the 14 references other than the artifact mapping); no `${CLAUDE_PLUGIN_*}` in reference files; setup's Artifact-tool mentions only in preflight/publish). No evals run here; per the orchestrator, the full sweep runs after the review fixes merge.
