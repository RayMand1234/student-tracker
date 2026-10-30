---
name: setup
description: Sets up Trainee tracking for a new Cycle — one batched question (the Commander's name and the Cycle are all it needs; role, Talk cadence, start date, course structure, Trainees, Project teams and extra Skills are optional), a confirmation, then the Cycle's private dashboard page and its store. Run once per Cycle.
argument-hint: "[שם, מחזור, שמות חניכים]"
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

# הקמת מעקב חניכים

Set up tracking for one Cycle. Talk to the Commander in Hebrew only, short and plain. Setup creates a Cycle; it never edits a finished one (changes go through normal chat).

- Plugin data dir: `${CLAUDE_PLUGIN_DATA}`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Pointer file: `${CLAUDE_PLUGIN_DATA}/cycles.json`
- Shipped Course preset: `${CLAUDE_PLUGIN_ROOT}/data/preset.json`; Skill framework: `${CLAUDE_PLUGIN_ROOT}/data/skills.json`

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
- No tracking exists yet → first-time setup: step 3.
- Several Cycles found → ask which one (by name) and stop until the Commander answers; then save that one as the pointer's `current` and run `connect` again.
- `setup: done` → ask exactly "להתחבר למחזור <cycle>, או להתחיל מחזור חדש?" and wait.
  - Connect → `connect` has already saved the pointer. Reply "מחובר למחזור <cycle>. אפשר פשוט לכתוב לי עדכונים." and stop.
  - New Cycle → reply "פתיחת מחזור חדש עוד לא נתמכת בגרסה הזו. המעקב של <cycle> נשאר מחובר." and stop.
- `setup: in-progress` → an earlier setup was interrupted. Never publish a second page. Read what is stored (`readCycle`, `readTeam`; a page with nothing seeded yet has no Cycle, so nothing to read) and say in one line that you're finishing the setup of <cycle>. Treat the stored values as the answers so far and go to step 5: the summary lists what is stored and adds what is still missing (a mandatory answer missing → ask for it first, as step 4 says). In step 6, `createCycle` is called again with every answer, stored or changed: it keeps what is stored and applies what changed.

## 3. Ask everything in one message

If the command arguments already give the Commander's name and the Cycle, don't ask: go to step 4 with them as the answer. Arguments: $ARGUMENTS

Otherwise read the shipped Course preset and send **one** message, then wait:

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

The preset summary is 3–4 lines built from the preset file, never copied from memory:
- the course and its length (`course`, and the number of weeks in `schedule`);
- the Subjects by Hebrew name, in the order the `schedule` first reaches them, joined by " ← ";
- the Projects by name, each with its weeks from the `schedule` ("Interpreter (שבועות 6–7)");
- how many Tests the catalog has.

## 4. Read the answer

Partial answers are fine. Only the Commander's name and the Cycle are mandatory: if either is missing, ask for just the missing one in one short line and keep everything else they said. Everything not answered takes its default.

- **Trainees**: first names only. Never store last names or other identifying details. Two Trainees with the same first name: ask for a short distinguishing label for both (a last-name initial or nickname, "נועה כ." / "נועה ל.") and use it as the display name.
- **Talk cadence**: whole days. "כל שבוע" is target 7. The thresholds stay yellow 10 / red 14 unless the Commander names them; a target past 10 moves yellow to the target and red to the target + 4 (say so in the summary).
- **Start date**: resolve it against today (`date '+%F %A'`), as `YYYY-MM-DD`.
- **Course differences** ("אין אצלנו Atom", "בפוב קוראים לו FOV2", "יש לנו גם תרץ Crocodile ב-OOP", "אין MZ", "הקורס 20 שבועות"): turn each into Course preset changes, by the same rules as the roster reference (`${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/roster.md`): `addTest` (ask for the Subject when it isn't clear), `editTest`, `removeTest`, `addProject`, `removeProject`, `setWeek`, `removeWeek` (a shorter course drops its last weeks, one call per week, from the end). They change only this Cycle's copy. A difference none of these can express: say in the summary that it can't be changed yet; setup goes on without it.
- **Extra info about a Trainee** ("נועה הגיעה ממדעי המחשב, רוצה להיות מפקדת"): an ordinary Entry, recorded in step 6 exactly as `${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/log.md` says for any update. The Entry's `text` is the Commander's answer message, word for word; the Evidence excerpts are cut from it, sensitive parts flagged and cut out, dated today unless the text says otherwise. Setup stores nothing else about a Trainee beyond the display name.
- **Project teams** ("בפאדנס נועה ודני בצוות"): `setTeam` per team, named as the Commander named it, else by its members.
- **Extra Skills**: `addSkill` to the Stage or the Interpersonal group they belong to (ask when it isn't clear).

## 5. Confirm

Show one short summary and wait for a yes. Nothing is created before it.

> זה מה שאקים:
> • מפקד: <name> (<role>, or "תפקיד לא צוין")
> • מחזור: <cycle>, התחיל ב-<DD/MM>
> • חניכים: <names, or "עוד לא — אפשר להוסיף בצ'אט">
> • שיחות: יעד כל <target> ימים (צהוב <yellow>, אדום <red>)
> • מבנה הקורס: ברירת המחדל (<course>), or with the changes listed one per line ("– בלי Atom", "– FOV נקרא FOV2", "– 20 שבועות")
> • <Project teams and extra Skills, one line each, when there are any>
> • <when Trainee info was given:> מה שסיפרת על <names> יירשם כתיעוד, כמו כל עדכון. פרטים אישיים נשמרים בתיק בלבד.
> <artifact backend only:> Claude Code יבקש ממך פעם אחת אישור לפרסם את דף המעקב (פרטי, רק לך).
> זה מה שאקים — לאשר?

When step 3 was skipped (the arguments answered), the Commander hasn't seen the course yet: the "מבנה הקורס" bullet holds the preset summary lines instead (once, not twice), followed by "אם משהו בקורס שלך שונה, כתוב לי לפני שאתה מאשר."

A clear yes ("כן", "מאשר", "יאללה") → step 6. A reply that changes or adds something → apply it to the answers and show the summary again. Anything else → create nothing.

## 6. Create

**Artifact backend**, first:
1. Publish the dashboard page with the Artifact tool: `file_path` = `${CLAUDE_PLUGIN_ROOT}/dashboard/index.html` (read it first, as the tool requires), `title` = "מעקב חניכים · <Cycle>", `description` = "דף המעקב של המחזור <Cycle>: מתי הייתה השיחה האחרונה עם כל חניך.", `icon` = "people", `capabilities` = `{"db": {}, "user": {}}`, `pin: true`. If the tool refuses that path, copy the file into your scratchpad dir and publish the copy. Skip this when finishing an interrupted setup.
2. Write the pointer right away, before seeding: set `current` to the page's address in `${CLAUDE_PLUGIN_DATA}/cycles.json` with the Write tool, keeping any `archived` list already there (`{"current": "<address>", "archived": []}` when there was no pointer).

Then, on either backend, in this order:
1. `createCycle` with the Commander's name, role, Talk values and the start date when given, the Cycle and the Trainees. (The local backend writes the pointer itself.)
2. Each Course preset change with `updateCycle`, in the order listed; then each extra Skill (`addSkill`); then each Project team (`setTeam`, members by the ids `createCycle` returned).
3. The Trainee info, if any: one `recordEntry` by log.md (read it, and the sensitive-details rules in it, before cutting).
4. `finishSetup`. Only after everything above went in.
5. Artifact backend: check once that `readTeam` shows one card per Trainee.

The Commander's yes in step 5 is the confirmation for every change in this step; don't ask again. When finishing an interrupted setup, check `readCycle` and `readTrainee` first and skip what is already stored (a preset change already applied, a team already there, an Entry with the same text). If an operation refuses (a duplicate name, an unknown Subject), fix the input with the Commander and run that operation again; never `finishSetup` with something missing.

## 7. Hand-off

One short Hebrew message:
- What was created: the Cycle, the Trainees (or that none were added yet), Talk target every <target> days.
- The course changes applied, as the list from the summary, when there were any; the Trainees whose info was recorded, when there were any.
- The dashboard link (artifact backend): private, pinned in the claude.ai sidebar, updates by itself. On the local backend say there is no page in a test setup.
- Three ways to start, with a real Trainee's name when there is one: "דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב".
- One line: to get plugin updates automatically, turn on auto-update under `/plugin` → Marketplaces.
