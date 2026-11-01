# Artifact backend: Playbook

**`savePlaybookItem`**: `get` `meta/skills`; check as store/playbook.md says. `source`: `get` `entries/<source>` (refuse missing, `deletion`, or `retracted` not `false`); its `text` must contain the item text; `query` `sensitive` where `entry == source`, refuse a text repeating one.
- New: create `playbook/p-<rand4>` `{origin: "commander", kind, skills, band|null, text, source|null, at: Now, retired: false}`.
- Edit: refuse `b-…`; `get` `playbook/<id>` (missing or retired → refuse), merge given fields, check, `set` with `edited: Now`, `if_version`; on a conflict start over.
Return the item with `id`.

**`retirePlaybookItem`**: refuse `b-…`; `get` `playbook/<id>` (missing or retired → refuse); `update` `{retired: {at: Now}}` with its version; on a conflict start over.

**`hidePlaybookItem`**: refuse `p-…`; hiding: refuse an id not in `data/playbook.json` `items` under the plugin root. `get` `commander/hides` (version `v`); already so → return unchanged; else `update` `{hidden}` with `if_version: v`; on a conflict start over. Return `{hidden}`.
