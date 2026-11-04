# Store: Playbook

Each only after the Commander confirms.

- `save-playbook-item [<item id>]` → the item with `id`. Payload: `+kind: sign|tip|exercise|talk-question`, `+skills: <Skill ids>` (or `general`), optional `+band: low|mid|high` (`none` clears; never on `general`), optional `+source: <entry id>` (the Entry it was quoted from), then the text word-for-word. With an id: an edit of the Commander's own item, only the lines that change.
- `retire-playbook-item <item id>` → the item: the Commander's own, kept but never suggested again.
- `hide-playbook-item <base id>` / `unhide-playbook-item <base id>` → `{hidden}`: base items (`b-…`) only.

```
student-tracker-store … save-playbook-item <<'ITEM'
+kind: tip
+skills: impl.debugging
לבקש להסביר לי את הקוד בקול לפני שאני מסתכל
ITEM
```
