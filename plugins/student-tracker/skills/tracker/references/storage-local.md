# Local backend

The local backend keeps the store as JSON files and is driven by the `student-tracker-store` command. Every call passes the plugin data dir given in SKILL.md:

```
student-tracker-store --data "<plugin data dir>" <operation> [args]
```

When the environment variable `STUDENT_TRACKER_DATA` is set (tests do this), the command uses that dir instead of `--data`, so a test never touches the Commander's real pointer.

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
| `createCycle(...)` | `create-cycle`, payload on stdin: `commander:`, `cycle:`, `trainee:` lines |

Payloads are plain text in a quoted heredoc, never JSON (the shell safety check refuses `{"` in a command). For `recordEntry`: a `--- entry` line, the Commander's message exactly as written, then for each Evidence a `--- evidence <tid> <kind> <YYYY-MM-DD>` line (optionally `topics=a,b`) followed by its excerpt exactly as written:

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי היום עם נועה, היא נתקעת בדיבאג
--- evidence t-ab12cd talk 2026-10-30 topics=דיבאג
דיברתי היום עם נועה, היא נתקעת בדיבאג
ENTRY
```

The command runs the whole write protocol itself, including version conflicts (it rebuilds the card); a refusal still means nothing of that step was written.

Files: `<store root>/<collection path>/<doc id>.json` holding `{version, data}`, e.g. `trainees/t-ab12cd/evidence/e-20261030-0915-x7-1.json`.
