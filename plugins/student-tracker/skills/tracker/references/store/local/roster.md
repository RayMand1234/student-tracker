# Local backend: roster, settings, course

One change per call, payload on stdin.

**`update-trainee [<tid>]`**: `add: <name>` (no tid), `rename: <name>`, `rejoin`, `leave: YYYY-MM-DD` + `how: dismissal|transfer|other` + `reason: …`, or `status: good|watch|concern` + `reason: …` + optional `evidence: <ids>`.

**`update-settings`**: any of `name:`, `role:` (empty clears), `target:`, `yellow:`, `red:`.

**`update-cycle`**: first line names the change, then its fields (`alias:`, `member:` repeat):

| First line | Fields |
|---|---|
| `add-test: <name>` | `subject:`, `number:`, `alias:` |
| `edit-test: <name or alias>` | `name:`, `number:`, `alias:` |
| `remove-test: <name or alias>` | — |
| `add-project: <name>` | `subject:`, `alias:` |
| `remove-project: <id, name or alias>` | — |
| `week: <n>` | `subjects: <id>, …`, `projects: <id>, …` |
| `remove-week: <last week>` | — |
| `add-skill: <name>` | `group: <group id>` |
| `archive-skill: <id>` / `restore-skill: <id>` | — |
| `team: <name>` | `project: <id>`, `member: <tid>`, `id: <team id>` (replace) |

```
student-tracker-store --data "<plugin data dir>" update-trainee t-ef34gh <<'CHANGE'
leave: 2026-10-29
how: transfer
reason: עבר לקורס אחר
CHANGE
```
