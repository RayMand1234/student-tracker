# student-tracker

A Claude Code plugin for Commanders in the Fullstack Course family. You write about your Trainees in Hebrew chat, the way you already talk ("דיברתי היום עם נועה…"), and the agent keeps the record: who you last had a Talk with, Evidence and Assessments per Skill, Follow-ups, improve/keep items, and Advice for the next Talk. A private dashboard page on claude.ai shows Talk circles (green → red by days since the last Talk), a window per Trainee and a full Trainee file.

The plugin speaks Hebrew only: setup, replies and the dashboard are all in Hebrew.

## Before you install

You need all of these. Setup checks the claude.ai ones before it asks you anything, and tells you in Hebrew what is missing.

- **git** on your machine. Claude Code adds the plugin's marketplace by cloning this repo, so there is no install path without git in this version. Check with `git --version`; if it's missing:
  - macOS: `xcode-select --install`
  - Windows: `winget install --id Git.Git -e`
  - Linux (Debian/Ubuntu): `sudo apt install git` (Fedora: `sudo dnf install git`)
- **Claude Code**, a recent version (built and tested on 2.1.31x). Update with `claude update`.
- **A paid claude.ai plan**: Pro, Max, Team or Enterprise. Free accounts can't create artifacts, and the plugin keeps everything in one.
- **Claude Code logged in with that claude.ai account**: run `/login` and choose the Claude account with a subscription. Sessions running on an API key, Bedrock, Vertex or Foundry can't create artifacts.
- **Artifacts allowed** for you:
  - On Team/Enterprise, your org's Owners can turn artifacts off or limit them by role. They are also unavailable under CMEK, HIPAA or Zero Data Retention.
  - `"enableArtifact": false` in your Claude Code settings (or `CLAUDE_CODE_DISABLE_ARTIFACT=1`, or `Artifact` in `permissions.deny`) turns them off.
- **A normal interactive session.** `claude -p` (print mode) can't create artifacts.

## Install

In Claude Code:

```
/plugin marketplace add RayMand1234/student-tracker
/plugin install student-tracker@student-tracker
```

Choose **Install for you (user scope)**. If Claude Code says so, run `/reload-plugins`. Then start setup:

```
/student-tracker:setup
```

Setup asks one batched question in Hebrew. Only your name and the Cycle's name are required; everything else has a default (role, Talk target of 10 days with yellow at 10 and red at 14, start date today, the shipped Fullstack Course preset). It shows a summary ("זה מה שאקים — לאשר?"), and after you confirm it creates the Cycle's private dashboard page ("מעקב חניכים · <Cycle>"), pinned in your claude.ai sidebar.

Claude Code asks your permission once to publish the page, and may ask again the first time in a session that the agent writes to the page's database.

## Turn on auto-update

Auto-update is **off by default** for marketplaces that aren't Anthropic's, and a marketplace can't switch it on for you. Turn it on once:

1. Run `/plugin`.
2. Open **Marketplaces**, pick **student-tracker**.
3. Choose **Enable auto-update**.

Updates then download in the background and apply on the next launch or after `/reload-plugins`.

To update by hand instead: `/plugin marketplace update student-tracker`, then `/reload-plugins`.

The plugin has no version number on purpose: every commit to this repo is a new version, so auto-update always brings you the latest.

## Using it

Just write in chat. A few ways to start:

- "דיברתי היום עם נועה, היא …" — logs an update. The agent splits it per Trainee, flags sensitive details, and replies with a short confirmation.
- "בטל" — undoes the last update.
- "תכין לי שיחה עם נועה" — a pre-Talk brief.
- "מה המצב" — team status: who needs a Talk, who is declining.
- "איך לעזור לנועה עם דיבאג?" — Advice from the Playbook.
- "תחקור את המצב של נועה בדיבאג" — online research: working hypotheses from what is on record, good sources from the web (with links) and 2–3 suggestions that join the two. Search queries carry only generic words (the Skill, "programming bootcamp"), never a name, a quote from your notes or anything personal; the reply ends with the queries it ran ("חיפשתי:").
- "תפתח דשבורד" — opens the dashboard.

Shortcuts: `/student-tracker:brief <שם>`, `/student-tracker:status`, `/student-tracker:dashboard`, `/student-tracker:research <שם> [נושא]`.

A new Cycle: run `/student-tracker:setup` again and choose to start a new Cycle. Your name, role, Talk thresholds and Playbook items carry over; the previous Cycle is kept as a read-only archive you can still ask about ("מה היה עם דני במחזור הקודם?").

A new machine: install the plugin and just write. The agent finds your Cycle on your claude.ai account by its title (if you have several, it asks which). Running `/student-tracker:setup` there offers to reconnect too ("להתחבר למחזור …").

## Where your data lives, and who can see it

- **Everything is in one private claude.ai artifact per Cycle**: its page is the dashboard, its database is the record. It's private to you unless you share it, and it follows your claude.ai account to any machine. Its content is stored on Anthropic's infrastructure.
- **Your machine keeps only a pointer** to that artifact: `~/.claude/plugins/data/student-tracker-student-tracker/cycles.json`. Uninstalling the plugin deletes the pointer, not the artifact; setup finds the artifact again.
- **Sensitive details** (health, family, distress or crisis, finances, romantic relationships, discipline or legal matters) are kept in the database, in a part the dashboard page never reads. Your raw messages are kept the same way. "Never shown" is not "not stored": they are in the artifact.
- **On Team and Enterprise plans, your org's Owners can reach your artifacts through the Compliance API**: they can list them, read their content and delete them, and they can set retention policies that delete artifacts automatically. Anthropic's docs don't say whether that includes the artifact's database; assume it does. If that matters for what you write about Trainees, use a personal Pro or Max account, or write less.
- Anthropic doesn't document a retention period for private artifacts on Pro and Max.
- Use first names only. When two Trainees share a name, the agent asks for a short label ("נועה כ.") rather than storing more identifying details.

## The Claude-only layer

The prompts (`skills/*/SKILL.md` bodies and `skills/tracker/references/`) follow the [Agent Skills](https://agentskills.io/specification) standard and are written agent-neutrally: they call storage operations defined in `skills/tracker/references/storage.md`, not any one tool. What ties the plugin to Claude Code with a claude.ai login is a thin layer:

- **Invocation flags** in skill frontmatter: `disable-model-invocation` (setup and the shortcuts are user-only), `argument-hint`, and `$ARGUMENTS` in the shortcuts.
- **Plugin path substitutions**: `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` in the `setup` and `tracker` SKILL.md files, and the `/student-tracker:<skill>` command names.
- **The Artifact and ArtifactData tools**: only in the artifact backend mapping (`skills/tracker/references/storage-artifact.md`) and in setup's preflight and publish steps.
- **The dashboard page** (`dashboard/`), which runs on claude.ai's artifact runtime.

Porting to another agent means replacing that layer, mainly with a new storage backend mapping. That port isn't part of this version.

## Repo layout

- `.claude-plugin/marketplace.json` — the marketplace (one plugin, relative path).
- `plugins/student-tracker/` — the plugin:
  - `skills/` — `setup`, `tracker` (handles all free text; one reference file per capability) and the `brief`, `status`, `dashboard` shortcuts.
  - `data/` — the Skill framework, the Fullstack Course preset and the base Playbook.
  - `dashboard/` — the page (`page.html` + `derive.mjs`, built into `index.html`).
  - `lib/`, `bin/` — a local JSON backend used only by tests and evals.
  - `test/`, `evals/` — unit tests and model evals.
- `.scratch/student-tracker/issues/` — the build tickets: the project's design record. Every Trainee name in them, and in tests and evals, is made up.

## Development

Needs Node.js 22 or later.

```
cd plugins/student-tracker
npm test          # unit tests, fast
npm run build     # rebuild dashboard/index.html after editing page.html or derive.mjs
npm run eval      # model evals: real Claude calls, slow, costs usage; run one at a time
```

`claude plugin validate .` (from the repo root) checks the marketplace and manifest. Its warning about a missing `version` is expected.
