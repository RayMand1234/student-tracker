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
| `resumePending()` | `resume-pending` |
| `rebuildCard(tid)` | `rebuild-card <tid>` |
| `updateCycle({addTest})` | `update-cycle`, payload on stdin: `add-test:`, `subject:`, `number:`, `alias:` lines |
| `openDashboard` | none: the local backend has no page; tell the Commander the dashboard exists only on a real Cycle |
| `createCycle(...)` | `create-cycle`, payload on stdin: `commander:`, `cycle:`, `trainee:` lines |

Payloads are plain text in a quoted heredoc, never JSON (the shell safety check refuses `{"` in a command). For `recordEntry`:

- a `--- entry` line, then the Commander's message exactly as written;
- per Evidence, a `--- evidence <tid> <kind> <YYYY-MM-DD>` line, then its fields as `+<field>: <value>` lines right under it (lists comma-separated: `+topics: דיבאג, פרויקט`, `+closes: <id>, <id>`; `+unlisted: true`; `+score: 85`), then its excerpt exactly as written;
- per Follow-up it opens, right after that Evidence, a `--- followup` line, then the Follow-up text exactly as written.

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
