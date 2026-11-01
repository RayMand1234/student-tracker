# Local backend: Cycle setup

| Operation | Command |
|---|---|
| `createCycle` | `create-cycle`: `commander:`, `cycle:`, `trainee:` (repeat); optional `role:`, `start:`, `target:`, `yellow:`, `red:`, `previous: <current address>`. Writes the pointer itself. |
| `finishSetup` | `finish-setup` |
| `copyCommanderScope` | `copy-commander-scope <previous address>` |
| `archiveCycle` | `archive-cycle <previous address>` |
| `unpinDashboard` | none (no page) |

```
student-tracker-store --data "<plugin data dir>" create-cycle <<'CYCLE'
commander: רז
role: מפ"צ
cycle: הצהובים
target: 7
trainee: נועה
trainee: דני
CYCLE
```
