# Local backend: core

Test backend: JSON files driven by `student-tracker-store`. Every call:

```
student-tracker-store --data "<plugin data dir>" <command> [args]
```

Archived Cycle reads: add `--cycle "<address from archived>"` before the command. Writes never take `--cycle`.

Success prints JSON. A refusal exits 1 with the reason on stderr and writes nothing. The command runs write/Retraction protocols and version conflicts itself.

Payloads go on stdin as plain text in a quoted heredoc, never JSON (the shell check refuses `{"`): `<<'X' … X`.

| Operation | Command |
|---|---|
| `connect` + `resumePending` + `readCycle` + `readTeam` (Start) | `start` → `{connect, resumePending, cycle, team}`; stops after `connect` unless setup is done, no `resumePending` on an archived Cycle; a refusal is `connect`'s |
| `connect` | `connect` (no `current`: looks under `<plugin data dir>/local/`; several are refused with their names, to ask) |
| `resumePending` | `resume-pending` |
| `readCycle` / `readTeam` | `read-cycle` / `read-team` |
| `rebuildCard(tid)` | `rebuild-card <tid>` |
| `openDashboard` | none: tell the Commander the dashboard exists only on a real Cycle |
