# Local backend

The local backend keeps the store as JSON files and is driven by the `student-tracker-store` command. Every call passes the plugin data dir given in SKILL.md:

```
student-tracker-store --data "<plugin data dir>" <operation> [args]
```

Tests select this backend with a pointer marked `"backend": "local"`; `create-cycle` keeps that mark.

Success prints JSON on stdout. A refusal exits 1 with the reason on stderr and writes nothing; fix the input (or ask the Commander) and call again.

| Operation | Command |
|---|---|
| `connect` | `connect` |
| `readCycle` | `read-cycle` |
| `readTeam` | `read-team` |
| `readTrainee(tid, since, retracted)` | `read-trainee <tid> --since YYYY-MM-DD` (omit `--since` for everything; add `--retracted` to include retracted records and Entries) |
| `recordEntry(...)` | `record-entry`, payload on stdin (below); add `--insist` when the Commander insisted on a Trainee who left |
| `recordAssessments(tid, ...)` | `record-assessments`, payload on stdin: `--- assessment` blocks (below) of that one Trainee, citing stored Evidence ids; `--insist` as above |
| `retractEntry(eid?)` | `retract-entry <entry id>` (omit the id for the last Entry) |
| `hardDelete(eid)` | `hard-delete <entry id>` |
| `resumePending()` | `resume-pending` |
| `rebuildCard(tid)` | `rebuild-card <tid>` |
| `flipSensitive(id, category?)` | `flip-sensitive <evidence id> --category <category>` (omit `--category` when moving out of sensitive) |
| `updateTrainee(tid?, change)` | `update-trainee [<tid>]`, payload on stdin: one change (below) |
| `updateSettings(change)` | `update-settings`, payload on stdin: any of `name:`, `role:`, `target:`, `yellow:`, `red:` lines (`role:` with nothing after it clears the role) |
| `updateCycle(change)` | `update-cycle`, payload on stdin: one change (below) |
| `openDashboard` | none: the local backend has no page; tell the Commander the dashboard exists only on a real Cycle |
| `createCycle(...)` | `create-cycle`, payload on stdin: `commander:`, `cycle:`, `trainee:` lines |

Payloads are plain text in a quoted heredoc, never JSON (the shell safety check refuses `{"` in a command). For `recordEntry`:

- a `--- entry` line, then the Commander's message exactly as written;
- per Evidence, a `--- evidence <tid> <kind> <YYYY-MM-DD>` line, then its fields as `+<field>: <value>` lines right under it (lists comma-separated: `+topics: דיבאג, פרויקט`, `+closes: <id>, <id>`; `+unlisted: true`; `+score: 85`), then its excerpt exactly as written;
- per Follow-up it opens, right after that Evidence, a `--- followup` line, then the Follow-up text exactly as written;
- per sensitive part cut out of it, after that Evidence (and its Follow-ups), a `--- sensitive <category>` line, then optional `+kind: <kind>` and `+closes: <ids>` lines, then the sensitive sentence exactly as written; the Follow-ups that part opens follow it as `--- followup` blocks;
- per Assessment, after all the Evidence, a `--- assessment <tid> <skill id> <score> <author>` line, then `+evidence: <refs>` (comma-separated: `#<n>` for this Entry's record `<entryId>-<n>`, or a stored Evidence id), then the reason;
- per improve/keep item, after all the Evidence, `--- item <tid> <improve|keep> <agent|commander>`, then `+from: <ref>` (its origin Evidence), then its text;
- per Trainee-state change, after all the Evidence:
  - `--- status <tid> <good|watch|concern>`, `+evidence: <refs>`, then the reason;
  - `--- stage <tid>`, `+to: <stage>` (`+to: none` leaves the process), `+evidence: <refs>` (the Commander's `evaluation-event` Evidence of this Entry), then the reason if any;
  - `--- snapshot <tid>`, then the Snapshot text;
  - `--- retire <tid> <item id> <agent|commander>`, `+evidence: <refs>`, then the reason.

A Talk with a sensitive sentence (the public excerpt shows the marker where the sentence was):

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי עם נועה על הפרויקט. ההורים שלה מתגרשים והיא לא ישנה. לבדוק איך היא מסתדרת.
--- evidence t-ab12cd talk 2026-10-30
+topics: פרויקט
דיברתי עם נועה על הפרויקט. [פרט אישי — בתיק]
--- sensitive family
ההורים שלה מתגרשים והיא לא ישנה. לבדוק איך היא מסתדרת.
--- followup
לבדוק איך היא מסתדרת.
ENTRY
```

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי היום עם נועה, היא נתקעת בדיבאג. סיכמנו שתשב עם דני על זה.
דני קיבל 85 בפוב.
--- evidence t-ab12cd talk 2026-10-30
+topics: דיבאג
דיברתי היום עם נועה, היא נתקעת בדיבאג. סיכמנו שתשב עם דני על זה.
--- followup
סיכמנו שתשב עם דני על זה
--- evidence t-ef34gh test 2026-10-30
+subject: tabi
+test: FOV
+score: 85
דני קיבל 85 בפוב.
ENTRY
```

A Talk with an agent Assessment, and the Commander's own Assessment cut as a note with a Commander Assessment:

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי עם נועה, היא מצאה לבד את הבאג בלולאה. העבודת צוות שלה זה 4
--- evidence t-ab12cd talk 2026-10-30
+topics: דיבאג
דיברתי עם נועה, היא מצאה לבד את הבאג בלולאה.
--- evidence t-ab12cd note 2026-10-30
העבודת צוות שלה זה 4
--- assessment t-ab12cd impl.debugging 3 agent
+evidence: #1, e-20261021-1010-k2-1
מצאה לבד את הבאג, אחרי שבוע שעבר נתקעה
--- assessment t-ab12cd inter.teamwork 4 commander
+evidence: #2
המפקד: 4
ENTRY
```

A Talk with an improve/keep item, the agent's Status and a fresh Snapshot:

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי עם דני, הוא לא הגיש שבוע שני. שיפור: להגיש בזמן.
--- evidence t-ef34gh talk 2026-10-30
+topics: הגשות
דיברתי עם דני, הוא לא הגיש שבוע שני. שיפור: להגיש בזמן.
--- item t-ef34gh improve commander
+from: #1
להגיש בזמן
--- status t-ef34gh watch
+evidence: #1
לא הגיש שבוע שני ברצף
--- snapshot t-ef34gh
מבין את החומר אבל לא מגיש; ההגשות הן המוקד עכשיו.
ENTRY
```

After the Commander confirmed a stage they gave:

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דני עולה לרף מקס, יש לו שיחה עם מפקד הקורס ביום ראשון.
--- evidence t-ef34gh evaluation-event 2026-10-30
דני עולה לרף מקס, יש לו שיחה עם מפקד הקורס ביום ראשון.
--- stage t-ef34gh
+to: רף מקס
+evidence: #1
ENTRY
```

A re-rate or an accepted proposal:

```
student-tracker-store --data "<plugin data dir>" record-assessments <<'RATE'
--- assessment t-ab12cd impl.debugging 2 commander
+evidence: e-20261030-0915-x7-1
אישור הצעה: נתקעת על כל באג ומחכה לעזרה
RATE
```

For `updateTrainee`, after the Commander confirmed, one change per call: `add: <name>` (no tid), `rename: <name>`, `rejoin`, `leave: YYYY-MM-DD` followed by `how: dismissal | transfer | other` and `reason: <short, display-safe>`, or `status: good | watch | concern` followed by `reason: <display-safe>` and optionally `evidence: <stored ids>`:

```
student-tracker-store --data "<plugin data dir>" update-trainee t-ef34gh <<'CHANGE'
leave: 2026-10-29
how: transfer
reason: עבר לקורס אחר
CHANGE
```

```
student-tracker-store --data "<plugin data dir>" update-trainee t-ef34gh <<'CHANGE'
status: concern
reason: אישור הצעה: לא מגיש שלושה שבועות
evidence: e-20261030-0915-x7-1
CHANGE
```

For `updateCycle`, after the Commander confirmed, one change per call. The first line names it; the lines after it are its fields (`alias:` and `member:` repeat):

| First line | Field lines | Change |
|---|---|---|
| `add-test: <name>` | `subject:`, `number:`, `alias:` | `addTest` |
| `edit-test: <current name or alias>` | `name:`, `number:`, `alias:` | `editTest` |
| `remove-test: <name or alias>` | — | `removeTest` |
| `add-project: <name>` | `subject:`, `alias:` | `addProject` |
| `week: <n>` | `subjects: <id>, <id>`, `projects: <id>, …` | `setWeek` |
| `add-skill: <name>` | `group: <Stage or group id>` | `addSkill` |
| `archive-skill: <Skill id>` / `restore-skill: <Skill id>` | — | `archiveSkill` / `restoreSkill` |
| `team: <team name>` | `project: <Project id>`, `member: <tid>`, `id: <team id>` (to replace that team) | `setTeam` |

```
student-tracker-store --data "<plugin data dir>" update-cycle <<'CHANGE'
add-test: Crocodile
subject: oop
number: 4
alias: קרוקודיל
CHANGE
```

```
student-tracker-store --data "<plugin data dir>" update-cycle <<'CHANGE'
team: בנק א
project: padens
member: t-ab12cd
member: t-ef34gh
CHANGE
```

For `createCycle`, one `key: value` per line (`trainee:` once per Trainee; `start: YYYY-MM-DD` only if the Commander gave a start date):

```
student-tracker-store --data "<plugin data dir>" create-cycle <<'CYCLE'
commander: רז
cycle: הצהובים
trainee: נועה
trainee: דני
CYCLE
```

The command runs the whole write or Retraction protocol itself, including version conflicts (it rebuilds the card); a refusal still means nothing of that step was written.

Files: `<store root>/<collection path>/<doc id>.json` holding `{version, data}`, e.g. `trainees/t-ab12cd/evidence/e-20261030-0915-x7-1.json`.
