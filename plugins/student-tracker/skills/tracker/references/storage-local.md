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
| `openDashboard` | none: the local backend has no page; tell the Commander the dashboard exists only on a real Cycle |
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
