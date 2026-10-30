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
| `readTrainee(tid, since)` | `read-trainee <tid> --since YYYY-MM-DD` (omit `--since` for everything) |
| `recordEntry(...)` | `record-entry`, payload on stdin (below) |
| `recordAssessments(tid, ...)` | `record-assessments`, payload on stdin: `--- assessment` blocks (below) of that one Trainee, citing stored Evidence ids |
| `resumePending()` | `resume-pending` |
| `rebuildCard(tid)` | `rebuild-card <tid>` |
| `flipSensitive(id, category?)` | `flip-sensitive <evidence id> --category <category>` (omit `--category` when moving out of sensitive) |
| `updateCycle({addTest})` | `update-cycle`, payload on stdin: `add-test:`, `subject:`, `number:`, `alias:` lines |
| `openDashboard` | none: the local backend has no page; tell the Commander the dashboard exists only on a real Cycle |
| `createCycle(...)` | `create-cycle`, payload on stdin: `commander:`, `cycle:`, `trainee:` lines |

Payloads are plain text in a quoted heredoc, never JSON (the shell safety check refuses `{"` in a command). For `recordEntry`:

- a `--- entry` line, then the Commander's message exactly as written;
- per Evidence, a `--- evidence <tid> <kind> <YYYY-MM-DD>` line, then its fields as `+<field>: <value>` lines right under it (lists comma-separated: `+topics: דיבאג, פרויקט`, `+closes: <id>, <id>`; `+unlisted: true`; `+score: 85`), then its excerpt exactly as written;
- per Follow-up it opens, right after that Evidence, a `--- followup` line, then the Follow-up text exactly as written;
- per sensitive part cut out of it, after that Evidence (and its Follow-ups), a `--- sensitive <category>` line, then optional `+kind: <kind>` and `+closes: <ids>` lines, then the sensitive sentence exactly as written; the Follow-ups that part opens follow it as `--- followup` blocks;
- per Assessment, after all the Evidence, a `--- assessment <tid> <skill id> <score> <author>` line, then `+evidence: <refs>` (comma-separated: `#<n>` for this Entry's record `<entryId>-<n>`, or a stored Evidence id), then the reason.

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

A re-rate or an accepted proposal:

```
student-tracker-store --data "<plugin data dir>" record-assessments <<'RATE'
--- assessment t-ab12cd impl.debugging 2 commander
+evidence: e-20261030-0915-x7-1
אישור הצעה: נתקעת על כל באג ומחכה לעזרה
RATE
```

For `updateCycle({addTest})`, after the Commander confirmed:

```
student-tracker-store --data "<plugin data dir>" update-cycle <<'CHANGE'
add-test: Crocodile
subject: oop
number: 4
alias: קרוקודיל
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

The command runs the whole write protocol itself, including version conflicts (it rebuilds the card); a refusal still means nothing of that step was written.

Files: `<store root>/<collection path>/<doc id>.json` holding `{version, data}`, e.g. `trainees/t-ab12cd/evidence/e-20261030-0915-x7-1.json`.
