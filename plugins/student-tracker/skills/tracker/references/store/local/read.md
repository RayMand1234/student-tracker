# Local backend: reads

| Operation | Command |
|---|---|
| `readTrainee` | `read-trainee <tid> [--since YYYY-MM-DD] [--retracted]` (no `--since` = everything) |
| `readPlaybook(tid, skills?)` | `read-playbook <tid> [<skill id> …]` |
| `readStatus` | `read-status` |
| `takeAlert(pattern?)` | `take-alert`, or `take-alert <tid> <theme words…>` |
