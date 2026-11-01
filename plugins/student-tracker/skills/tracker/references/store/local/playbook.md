# Local backend: Playbook

| Operation | Command |
|---|---|
| `savePlaybookItem` | `save-playbook-item [<item id>]`: `+kind:`, `+skills: <ids>` (or `general`), optional `+band: low|mid|high` (`none` clears), `+source: <eid>`, then the text word-for-word. Edit: only changed lines. |
| `retirePlaybookItem` | `retire-playbook-item <id>` |
| `hidePlaybookItem` | `hide-playbook-item <base id>` / `unhide-playbook-item <base id>` |

```
student-tracker-store --data "<plugin data dir>" save-playbook-item <<'ITEM'
+kind: tip
+skills: impl.debugging
לבקש להסביר לי את הקוד בקול לפני שאני מסתכל
ITEM
```
