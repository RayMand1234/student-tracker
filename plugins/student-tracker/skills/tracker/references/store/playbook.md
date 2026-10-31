# Store: Playbook

The Commander's items `playbook/p-<rand4>` are edited in place: `{origin: "commander", kind, skills, band, text, source: <eid>|null, at, edited?, retired: false|{at}}`. Retired items stay stored, never suggested. Retracting the source Entry leaves the item. All only after the Commander confirms.

- **`savePlaybookItem(item)`** → the item with `id`. New (no `id`): `kind` (sign|tip|exercise|talk-question), `text` (word-for-word, trimmed), `skills` (≥1 Skill id of this Cycle, or `["general"]` alone), optional `band` (none on general), optional `source` (a live Entry whose text holds it, not repeating a sensitive part). With `id`: changes only the given fields (`band: null` clears), sets `edited`. Refuses a base item (`b-…`: hide it), an unknown or retired item, an archived Skill, nothing to change, or changing `source`.
- **`retirePlaybookItem(id)`** → the item. Refuses a base id, unknown, or already retired.
- **`hidePlaybookItem(baseId, hidden)`** → `commander/hides`. Hide/unhide a base item; repeating is a no-op. Refuses hiding an id the shipped Playbook lacks (unhiding is allowed) and a Commander id (retire it).
