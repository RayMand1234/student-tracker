---
name: setup
description: Sets up Trainee tracking for a new Cycle — asks the Commander's name, the Cycle name and the Trainees' first names, then creates the Cycle's private dashboard page and its store. Run once per Cycle.
argument-hint: "[שם, מחזור, שמות חניכים]"
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

# הקמת מעקב חניכים

Set up tracking for one Cycle. Talk to the Commander in Hebrew only, short and plain. Setup creates a Cycle; it never edits an existing one (changes go through normal chat).

- Plugin data dir: `${CLAUDE_PLUGIN_DATA}`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Pointer file: `${CLAUDE_PLUGIN_DATA}/cycles.json`

Storage operations are defined in `${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/storage.md`. Read it, then the mapping file it names for the backend.

## 1. Backend and preflight

Read the pointer file (a missing file means there is no pointer).

- The pointer is marked `"backend": "local"` → **local test backend**: no page is published; skip the rest of this step.
- Otherwise → **artifact backend**. Before asking anything, check that this session can create artifacts: the `Artifact` tool is in your tool list, and ToolSearch `select:ArtifactData` finds `ArtifactData`. If either is missing, send exactly this and stop:

> אי אפשר להקים את המעקב בסשן הזה, כי Claude Code לא יכול ליצור כאן את דף המעקב. בדרך כלל הסיבה אחת מאלה:
> • נדרש מנוי Pro, Max, Team או Enterprise.
> • צריך להיות מחובר עם חשבון claude.ai: הרץ `/login` ובחר בחשבון claude.ai.
> • בעבודה דרך API key, Bedrock או Vertex אין דפי artifact. התחבר עם חשבון claude.ai.
> • הארגון חסם artifacts, במדיניות הארגון או ב-`enableArtifact: false` בהגדרות. פנה למנהל הארגון.
> • Claude Code רץ במצב לא-אינטראקטיבי (`claude -p`). הרץ את ההקמה בסשן רגיל.

## 2. Existing Cycle?

Run `connect`.
- It reports that no tracking exists yet → first-time setup, continue.
- It succeeds with `setup: done` → tell the Commander "כבר קיים מעקב למחזור <cycle>. אפשר פשוט לכתוב לי עדכונים." and stop. (If it found the Cycle by title on this machine, it has saved the pointer; say "התחברתי למחזור <cycle>." instead.)
- It succeeds with `setup: in-progress` → an earlier setup was interrupted. Say so, read what is stored (`readCycle`, `readTeam`), and continue with step 3 using it as the answers so far. Step 5 then finishes seeding into the same store, with no new page.

## 3. Collect the answers

Needed: the Commander's name (how they want to be addressed) and the Cycle name or color. Optional: the Trainees' first names (they can be added later in chat).

If the command arguments already give the Commander's name and Cycle name, use them and skip the question. Arguments: $ARGUMENTS

Otherwise ask everything in **one** message and wait for the answer:

> כדי להקים את המעקב:
> 1. איך לקרוא לך?
> 2. שם/צבע המחזור?
> 3. שמות החניכים (שמות פרטיים בלבד) — אפשר גם להוסיף אחר כך.

Rules:
- First names only. Never store last names or other identifying details.
- Two Trainees with the same first name: ask for a short distinguishing label (a last-name initial or nickname, e.g. "נועה כ.") and use it as the display name.
- Defaults: Cycle start date today; Talk target 10 days, yellow 10, red 14.

## 4. Confirm

Always show a short summary (Commander, Cycle, Trainees, Talk target every 10 days). On the artifact backend add one line: "Claude Code יבקש ממך פעם אחת אישור לפרסם את דף המעקב (פרטי, רק לך)." End with "זה מה שאקים — לאשר?" and wait for a yes. Nothing is created before the Commander confirms.

## 5. Create

**Artifact backend**, in this order:
1. Publish the dashboard page with the Artifact tool: `file_path` = `${CLAUDE_PLUGIN_ROOT}/dashboard/index.html` (read it first, as the tool requires), `title` = "מעקב חניכים · <Cycle>", `description` = "דף המעקב של המחזור <Cycle>: מתי הייתה השיחה האחרונה עם כל חניך.", `icon` = "people", `capabilities` = `{"db": {}, "user": {}}`, `pin: true`. If the tool refuses that path, copy the file into your scratchpad dir and publish the copy. Skip this when resuming an interrupted setup.
2. Write the pointer right away, before seeding: set `current` to the page's address in `${CLAUDE_PLUGIN_DATA}/cycles.json` with the Write tool, keeping any `archived` list already there (`{"current": "<address>", "archived": []}` when there was no pointer).
3. `createCycle` as the artifact mapping describes. The Skill framework file is `${CLAUDE_PLUGIN_ROOT}/data/skills.json`; the Course preset file is `${CLAUDE_PLUGIN_ROOT}/data/preset.json`.
4. Check once: `readTeam` shows one card per Trainee.

**Local test backend**: `createCycle` as the local mapping describes (it writes the pointer itself).

If `createCycle` refuses (for example a duplicate name), fix the input with the Commander and run it again.

## 6. Hand-off

One short Hebrew message:
- What was created: the Cycle, the Trainees, Talk target every 10 days.
- The dashboard link (artifact backend): private, pinned in the claude.ai sidebar, updates by itself.
- Three ways to start: "דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב".
- One line: to get plugin updates automatically, turn on auto-update under `/plugin` → Marketplaces.
