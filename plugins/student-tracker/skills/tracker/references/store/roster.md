# Store: roster, settings, course

Each only after the Commander confirms; one change per call.

- `update-trainee [<tid>]` → the card with `id`. Payload, one of:
  - `add: <name>` (no tid): a new Trainee.
  - `rename: <name>`: also how a label is given ("נועה כ.").
  - `leave: YYYY-MM-DD`, `how: dismissal|transfer|other`, `reason: <short>`.
  - `rejoin`.
  - `status: good|watch|concern`, `reason: <text>`, optional `evidence: <stored Evidence ids>`: the Commander's Status. The agent's Status changes are refused for that Trainee after it.
  - A name clashing with another Trainee's (a bare first name another starts with: "נועה" / "נועה כ.") is refused: ask a label for both.
- `update-settings` → the settings. Any of `name:`, `role:` (empty clears), `target:`, `yellow:`, `red:` (whole days, `target` ≤ `yellow` < `red`).
- `update-cycle` → the changed document. The first line names the change, then its fields (`alias:` and `member:` repeat):

| First line | Fields |
|---|---|
| `add-test: <name>` | `subject:`, `number:`, `alias:` |
| `edit-test: <name or alias>` | `name:`, `number:`, `alias:` |
| `remove-test: <name or alias>` | — |
| `add-project: <name>` | `subject:`, `alias:` |
| `remove-project: <id, name or alias>` | — (refused while it has a team) |
| `week: <n>` | `subjects: <id>, …`, `projects: <id>, …` |
| `remove-week: <last week>` | — |
| `add-skill: <name>` | `group: <group id>` |
| `archive-skill: <id>` / `restore-skill: <id>` | — |
| `team: <name>` | `project: <id>`, `member: <tid>`, `id: <team id>` (to replace one) |

```
student-tracker-store … update-trainee t-ef34gh <<'CHANGE'
leave: 2026-10-29
how: transfer
reason: עבר לקורס אחר
CHANGE
```
