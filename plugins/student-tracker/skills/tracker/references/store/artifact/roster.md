# Artifact backend: roster, settings, course

Check every refusal in store/roster.md first.

## `updateTrainee`

`list` `trainees` for the names. Leave/Status reasons: display-safe check against stored sensitive records.
- `add`: new `t-<rand6>`. One `batch`: create `trainees/<tid>/changes/added` `{type: "added", name, by: "commander", at, retracted: false}` and the card (`name`, `active: true`, `left: null`, `items: []`, `followups: []`, `skills: {}`, the rest `null`).
- `rename`, `leave`, `rejoin`, `status`: record at `trainees/<tid>/changes/c-…`: `{type: "renamed", name}`, `{type: "left", date, how, reason}`, `{type: "rejoined"}`, or `{type: "status", from: <card status.value|null>, to, reason, evidence}`, each `+ by: "commander", at, retracted: false`. `status`: refuse a Trainee with `left`; each cited id must be a live Evidence of that Trainee (`evidence/` or `sensitive/` `record: "evidence"`). `get` the card (version `v`), apply the record (`name`; `left`/`active`; `status` = `{value: to, by: "commander", reason, at}`), one `batch`: create the record, `set` the card with `if_version: v`. Conflict → start over with the same id.

Return the card with `id`.

## `updateSettings`

`get` `commander/settings` (version `v`); `name`/`role` replace, `talk` values replace only those given; check; `set` with `at: Now`, `if_version: v`; on a conflict start over. Return it.

## `updateCycle`

- **Preset** (`addTest`…`removeWeek`): `get` `meta/preset` (version `v`); `update` only the changed field (`tests`, `projects`, `schedule`) with `if_version: v`; on a conflict start over. Slug = lowercase name, runs of non a–z/0–9 → "-", trimmed. Test id `<subject>.<slug>` (`<subject>.t-<rand4>` if empty); Project id `<slug>` (`p-<rand4>` if empty); add `-<rand2>` while taken. `editTest` new name → old one appended to `aliases`; `aliases` never holds the Test's own name. `setWeek`: drop that week, add `{week, subjects, projects?}` (no empty `projects` key), sort. `removeProject`: `list` `teams`, refuse if one has it; drop from `projects` and each week's `projects` (drop emptied keys), one `update` `{projects, schedule}`. `removeWeek`: only the highest week.
- **Skills** (`addSkill`, `archiveSkill`, `restoreSkill`): `get` `meta/skills` (version `v`); append `{id: <group>.c-<rand4> unused anywhere, name, added: Now}`, or set `archived: true, archivedAt: Now`, or drop both; `update` `{groups}` with `if_version: v`; on a conflict start over. Return `{skill, skills}`.
- **`setTeam`**: `list` `teams`; with `id`, `get` `teams/<id>` (version `v`). Data `{project, name, members (no repeats), at: Now}`. New → create `teams/tm-<rand4>`; replace → `set` with `if_version: v`. Return it with `id`. Records already written keep their `team`.
