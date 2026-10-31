# Artifact backend: Cycle setup

## `createCycle`

Runs after setup published the page and wrote the pointer.

0. Check, writing nothing: `start` (default today) is `YYYY-MM-DD`; Talk values pass `updateSettings`' checks; no clashing names (→ "ask for a distinguishing label for both"). With `previous`: `get` `meta/cycle` here; if `in-progress` (resumed), `previous` must equal its stored `previous`; else `previous` must be the last address in `archived` and its `meta/cycle` `setup: "done"`. Otherwise refuse "previous must be the Cycle this one follows, set up and done".
1. `get` `meta/cycle`. `done` → refuse "כבר קיים מעקב למחזור <name>". Missing → create `{name, start, setup: "in-progress", schema: 1, archived: false, at}` (+`previous`). `in-progress` → `update` `{name, start}` (start as stored unless given) with its version.
2. `get` each, then one `batch` creating only the missing ones:
   - `meta/skills`: `file_path` = the Skill framework file named in setup
   - `meta/preset`: `file_path` = the Course preset file named in setup
   - `commander/settings`: `{name, role, talk: {target, yellow, red}, at}`, defaults role `null`, Talk 10/10/14 (with `previous`: its role and Talk from `get` `commander/settings` there). Exists → `set` with its version: `name` as given, others as given else stored.
   - `commander/hides`: `{hidden: []}`
3. `list` `trainees`; skip names that have a card. Per new name `t-<rand6>`, batches of ≤24 Trainees: `trainees/<tid>/changes/added` `{type: "added", name, by: "commander", at, retracted: false}` and the card (`name`, `active: true`, `left: null`, `items: []`, `followups: []`, `skills: {}`, the rest `null`).

Stays `in-progress` until `finishSetup`.

## `finishSetup`

`get` `meta/cycle` (missing → refuse "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`"); `done` → return it; else `update` `{setup: "done"}` with its version; on a conflict start over.

## `copyCommanderScope(fromUrl)`

Refuse `fromUrl` = `current`; `get` `meta/cycle` at `fromUrl` (missing → "no Cycle at <fromUrl>") and at `current` (not `in-progress` → refuse). Read at `fromUrl`, write at `current`:
1. `commander/settings` at both: missing here → create from there with `at: Now` (`"copied"`); else `"kept"`.
2. `list` `playbook` there (`limit: 1000`); `get` `meta/skills` at both. Each Skill id a live item is tagged to (not `"general"`) missing here: append it as stored to the same group, unless that group has a Skill of the same name (ignoring case and spacing): retag the item to that one. Any added → `update` `{groups}` with `if_version`; on a conflict start over.
3. `list` `playbook` here; create each missing item with its stored data (retagged), batches of ≤50; "already exists" is fine.
4. `commander/hides` at both: add missing ids → `update` `{hidden}` with `if_version` (create if missing); on a conflict start over.

Return `{settings, skills, playbook, hidden}` (added ids).

## `archiveCycle(url)`

Refuse `url` = `current`; `get` `meta/cycle` at `url` (missing → "no Cycle at <url>"). Add `url` to the pointer's `archived` if missing (Write tool, keep `current`). Run `resumePending`'s steps with `url` for every read and write. Unless already archived, `update` `meta/cycle` at `url` `{archived: true, archivedAt: Now}` with its version; on a conflict start over. Return its `meta/cycle`. Never delete the page.

## `unpinDashboard(url)`

Artifact tool `action: "unpin"` with `url`.
