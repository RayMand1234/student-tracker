---
name: setup
description: Sets up Trainee tracking for a new Cycle: one batched question, a confirmation, then the dashboard page and store. Once per Cycle.
argument-hint: "[שם, מחזור, שמות חניכים]"
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

# הקמת מעקב חניכים

Set up tracking for one Cycle. Hebrew only, short and plain. Setup creates a Cycle, never edits a finished one (changes go through chat). With a Cycle already there, the Commander can start the next: settings, Playbook items and hides carry over; the previous Cycle is archived (read-only).

- Plugin data dir: `${CLAUDE_PLUGIN_DATA}`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Pointer file: `${CLAUDE_PLUGIN_DATA}/cycles.json`
- Shipped Course preset: `${CLAUDE_PLUGIN_ROOT}/data/preset.json`; Skill framework: `${CLAUDE_PLUGIN_ROOT}/data/skills.json`

Storage: after step 1 picks backend `<b>`, read from `${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/store/`: `core.md`, `<b>/core.md`, `read.md`, `<b>/read.md`, `cycle.md`, `<b>/cycle.md`. Read `roster.md` + `<b>/roster.md` only if there are course changes, Skills or teams to apply; `record.md` + `<b>/record.md` only if there is Trainee info to record.

## 1. Backend and preflight

Read the pointer file (a missing file means there is no pointer).

- Pointer `current` starts with `local:` or `"backend": "local"` → `<b>` = `local` (test backend, no page); skip the rest of this step.
- Otherwise `<b>` = `artifact`. Before asking anything, check that this session can create artifacts: the `Artifact` tool is in your tool list, and ToolSearch `select:ArtifactData` finds `ArtifactData`. If either is missing, send exactly this as your whole reply (no words before or after it, not quoted) and stop:

> אי אפשר להקים את המעקב בסשן הזה, כי Claude Code לא יכול ליצור כאן את דף המעקב. בדרך כלל הסיבה אחת מאלה:
> • נדרש מנוי Pro, Max, Team או Enterprise.
> • צריך להיות מחובר עם חשבון claude.ai: הרץ `/login` ובחר בחשבון claude.ai.
> • בעבודה דרך API key, Bedrock או Vertex אין דפי artifact. התחבר עם חשבון claude.ai.
> • הארגון חסם artifacts, במדיניות הארגון או ב-`enableArtifact: false` בהגדרות. פנה למנהל הארגון.
> • Claude Code רץ במצב לא-אינטראקטיבי (`claude -p`). הרץ את ההקמה בסשן רגיל.

## 2. Existing Cycle?

Run `connect`.
- No tracking exists yet → first-time setup: step 3.
- Several Cycles found → ask which one (by name) and stop until the Commander answers; then save that one as the pointer's `current` and run `connect` again.
- `setup: done` → ask exactly "להתחבר למחזור <cycle>, או להתחיל מחזור חדש?" and wait.
  - Connect → `connect` has already saved the pointer. Reply "מחובר למחזור <cycle>. אפשר פשוט לכתוב לי עדכונים." and stop.
  - New Cycle → the current one is the **previous Cycle** (address = `connect`'s `url`, name = `cycle`). `readCycle` it now for the Commander's settings and counts of live Playbook items (`playbook`, not retired) and hides (`commander.hides.hidden`). Step 3.
- `setup: in-progress` → an earlier setup was interrupted. Never publish a second page.
  - It is a **new Cycle** if `readCycle` shows `cycle.previous` (the previous Cycle), or, nothing seeded yet, if the pointer's `archived` has an address whose Cycle (`readCycle` with it as `cycle`) is not `archived: true`. Then read the previous name there and say you're finishing the new Cycle that continues <previous>.
  - Read what is stored (`readCycle`, `readTeam`; nothing seeded → nothing to read), say in one line you're finishing the setup of <cycle>, treat stored values as the answers so far, and go to step 5 (a missing mandatory answer → ask first, as step 4). Use step 5's summary as written, ending "זה מה שאקים — לאשר?", never your own question. In step 6, call `createCycle` again with every answer, stored or changed.

## 3. Ask everything in one message

If the command arguments already give the Commander's name and the Cycle, don't ask: go to step 4 with them as the answer. Arguments: $ARGUMENTS

**A new Cycle**: don't ask name, role or Talk cadence again; show them for change. Send (course part as below):

> מחזור חדש. ממשיך עם: <name>, <role or "תפקיד לא צוין">, שיחה כל <target> ימים (צהוב <yellow>, אדום <red>)<, when there are any: ", <n> פריטים שלך בפלייבוק", ", <m> פריטי בסיס שהסתרת"> — לשנות?
> ענה לי בהודעה אחת. רק 1 חובה; על כל השאר יש ברירת מחדל, ואפשר להוסיף אחר כך בצ'אט.
> 1. שם/צבע המחזור החדש?
> 2. מתי התחיל? (ברירת מחדל: היום, <DD/MM>)
> 3. שמות החניכים (שמות פרטיים בלבד), ומה שתרצה לספר על כל אחד.
> 4. צוותי פרויקטים, או מיומנויות שתרצה לעקוב אחריהן מעבר לרשימה הקבועה.
> <the course part, as below>
> <previous> יעבור לארכיון: הוא נשמר, לקריאה בלבד, ואפשר לשאול עליו בצ'אט.

**First Cycle**: read the shipped Course preset, send **one** message, wait:

> כדי להקים את המעקב, ענה לי בהודעה אחת, במילים שלך. רק 1 ו-2 חובה; על כל השאר יש ברירת מחדל, ואפשר להוסיף אחר כך בצ'אט.
> 1. איך לקרוא לך?
> 2. שם/צבע המחזור?
> 3. התפקיד שלך? (ברירת מחדל: לא צוין)
> 4. כל כמה ימים שיחה עם כל חניך? (ברירת מחדל: יעד 10 ימים; צהוב אחרי 10, אדום אחרי 14)
> 5. מתי התחיל המחזור? (ברירת מחדל: היום, <DD/MM>)
> 6. שמות החניכים (שמות פרטיים בלבד), ומה שתרצה לספר על כל אחד.
> 7. צוותי פרויקטים, או מיומנויות שתרצה לעקוב אחריהן מעבר לרשימה הקבועה.
>
> מבנה הקורס (ברירת מחדל):
> <the preset summary>
> תואם לקורס שלך? אם משהו שונה, כתוב מה.

Preset summary, 3–4 lines from the preset file, never from memory: `course` and its weeks (`schedule` length); Subjects by Hebrew name in first-reached order, joined " ← "; Projects with their weeks ("Interpreter (שבועות 6–7)"); the number of Tests.

## 4. Read the answer

Partial answers are fine. Mandatory: the Commander's name and the Cycle (new Cycle: only the Cycle). Missing → ask just for it in one short line, keeping the rest. Unanswered → default.

- **Trainees**: first names only; never last names or identifying details. Same first name twice → ask a short label for both ("נועה כ." / "נועה ל."), used as display name.
- **New Cycle**: previous name, role and Talk values stand unless changed ("ממשיך", "בלי שינוי" = no change). The Cycle name must differ from the previous. Trainees, teams, Skills and course differences don't carry over.
- **Talk cadence**: whole days; "כל שבוע" = target 7. Yellow 10 / red 14 unless named; a target past 10 moves yellow to the target and red to target + 4 (say so in the summary).
- **Start date**: resolve against today (`date '+%F %A'`) as `YYYY-MM-DD`.
- **Course differences** ("אין אצלנו Atom", "בפוב קוראים לו FOV2", "יש לנו גם תרץ Crocodile ב-OOP", "אין MZ", "הקורס 20 שבועות"): each becomes `updateCycle` preset changes: `addTest` (ask the Subject if unclear), `editTest`, `removeTest`, `addProject`, `removeProject`, `setWeek`, `removeWeek` (shorter course: drop last weeks, one call each, from the end). Only this Cycle's copy changes. Not expressible → say in the summary it can't be changed yet, and go on.
- **Trainee info** ("נועה הגיעה ממדעי המחשב, רוצה להיות מפקדת"): an ordinary Entry, recorded in step 6 as `${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/log.md` says. `text` = the Commander's answer message word for word; excerpts cut from it, sensitive parts cut out, dated today unless stated. Nothing else about a Trainee is stored beyond the display name.
- **Project teams** ("בפאדנס נועה ודני בצוות"): `setTeam` per team, named as given, else by its members.
- **Extra Skills**: `addSkill` to the right Stage or the Interpersonal group (ask if unclear).

## 5. Confirm

Show one short summary and wait for a yes. Nothing is created before it.

> זה מה שאקים:
> • מפקד: <name> (<role>, or "תפקיד לא צוין")
> • מחזור: <cycle>, התחיל ב-<DD/MM>
> • חניכים: <names, or "עוד לא — אפשר להוסיף בצ'אט">
> • שיחות: יעד כל <target> ימים (צהוב <yellow>, אדום <red>)
> • מבנה הקורס: ברירת המחדל (<course>), or with the changes listed one per line ("– בלי Atom", "– FOV נקרא FOV2", "– 20 שבועות")
> • <Project teams and extra Skills, one line each, when there are any>
> • <a new Cycle:> ממשיך מ-<previous>: <n> פריטים שלך בפלייבוק, <m> הסתרות (or just "ההגדרות שלך" when there are none)
> • <a new Cycle:> <previous> יעבור לארכיון: נשמר לקריאה בלבד, ואפשר לשאול עליו בצ'אט.
> • <when Trainee info was given:> מה שסיפרת על <names> יירשם כתיעוד, כמו כל עדכון. פרטים אישיים נשמרים בתיק בלבד.
> <artifact backend only:> Claude Code יבקש ממך פעם אחת אישור לפרסם את דף המעקב (פרטי, רק לך).
> זה מה שאקים — לאשר?

Step 3 skipped (arguments answered) → the "מבנה הקורס" bullet holds the preset summary lines instead (once), then "אם משהו בקורס שלך שונה, כתוב לי לפני שאתה מאשר."

Clear yes ("כן", "מאשר", "יאללה") → step 6. A change or addition → apply, show the summary again. Anything else → create nothing.

## 6. Create

**Artifact backend**, first:
1. Publish the dashboard page with the Artifact tool as a new page (a path already published in this conversation would overwrite that page): copy `${CLAUDE_PLUGIN_ROOT}/dashboard/index.html` to a fresh path (`<scratchpad>/student-tracker-<Cycle slug>-<YYYYMMDD-HHMM>/index.html`), read the copy, publish without `url`: `file_path` = the copy, `title` = "מעקב חניכים · <Cycle>", `description` = "דף המעקב של המחזור <Cycle>: מתי הייתה השיחה האחרונה עם כל חניך.", `icon` = "people", `capabilities` = `{"db": {}, "user": {}}`, `pin: true`. The returned address must differ from every address in the pointer; else stop and tell the Commander. Skip when finishing an interrupted setup.
2. Write the pointer at once, before seeding: `current` = the page address in `${CLAUDE_PLUGIN_DATA}/cycles.json` (Write tool), keeping `archived` (`{"current": "<address>", "archived": []}` if none). New Cycle: in the same write, append the previous address to `archived`.

Then, on either backend, in this order:
1. `createCycle` with the Commander's name, role, Talk values and the start date when given, the Cycle and the Trainees; on a new Cycle also `previous` = the previous Cycle's address. (The local backend writes the pointer itself.)
2. Each Course preset change with `updateCycle`, in the order listed; then each extra Skill (`addSkill`); then each Project team (`setTeam`, members by the ids `createCycle` returned).
3. Trainee info, if any: one `recordEntry` by log.md (read it, including its sensitive-details rules, before cutting).
4. New Cycle: `copyCommanderScope` from the previous address, then `archiveCycle` of it. Both safe to rerun.
5. `finishSetup`, only after everything above went in.
6. Artifact backend: check once that `readTeam` shows one card per Trainee.

Step 5's yes confirms every change here; don't ask again. Finishing an interrupted setup: check `readCycle` and `readTrainee` first and skip what is stored (applied preset change, existing team, an Entry with the same text). A refusal → fix the input with the Commander and rerun; never `finishSetup` with something missing.

## 7. Hand-off

One short Hebrew message:
- Created: the Cycle, the Trainees (or none yet), Talk target every <target> days.
- Course changes applied (the summary's list) and Trainees whose info was recorded, if any.
- Artifact: the dashboard link, private, pinned in the claude.ai sidebar, self-updating. Local: no page in a test setup.
- Three ways to start, with a real Trainee's name if any: "דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב".
- New Cycle: one line on what carried over (settings, <n> Playbook items, <m> hides) and that <previous> is archived, read-only, askable ("מה היה עם דני במחזור הקודם?").
- One line: for automatic plugin updates, turn on auto-update under `/plugin` → Marketplaces.

New Cycle on artifact: end with one question, asked once only: "להוריד את <previous> מהסרגל של claude.ai? הוא נשאר בארכיון, ואפשר לשאול עליו בצ'אט." Clear yes → `unpinDashboard` with the previous address; say it's done in one line. Else leave it and say nothing more.
