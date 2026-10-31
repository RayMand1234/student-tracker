# Store: roster, settings, course

All only after the Commander confirms.

## `updateTrainee(tid?, change)` → the card, with `id`

One change, written as a `changes` record plus the card:
- `{add: {name}}`, no `tid`: new Trainee.
- `{rename: {name}}`: also how a distinguishing label is given ("נועה כ.").
- `{leave: {date, how, reason}}`: `how` dismissal|transfer|other; `reason` short, display-safe; date not in the future. Records stay, read-only.
- `{rejoin: {}}`.
- `{status: {to, reason, evidence?}}`: the Commander's Status (override, or an accepted proposal); `evidence` = stored Evidence ids (may be empty). After it, the agent's Status changes are refused for that Trainee.

Refuses: unknown Trainee; empty name; a name clashing with another Trainee's, left ones included (same ignoring case and spacing, or a bare first name another starts with: "נועה" / "נועה כ." → ask a label for both); leaving twice; rejoining someone not left; Status unknown, unchanged, without reason, or for a Trainee who left. A stage changes only through `recordEntry`.

## `updateSettings(change)` → `commander/settings`

Any of `name`, `role` (`null` clears), `talk: {target?, yellow?, red?}` (days, whole ≥1, `yellow` < `red`, `target` ≤ `yellow`). The dashboard's Talk circles follow.

## `updateCycle(change)` → the changed document

Exactly one of (names and aliases compare ignoring case and spacing; must not clash with another Test/Project):
- `{addTest: {name, subject, number?, aliases?}}` → preset. Id `<subject>.<slug>`.
- `{editTest: {test, name?, number?, aliases?}}` → preset. A new name keeps the old as alias.
- `{removeTest: {test}}` → preset. Recorded Evidence keeps its words.
- `{addProject: {name, subject, aliases?}}` → preset.
- `{removeProject: {project}}` → preset; also leaves every `schedule` week. Refused while it has a Project team.
- `{setWeek: {week, subjects, projects?}}` → preset; replaces or adds the week.
- `{removeWeek: {week}}` → preset; only the last week (one call per week).
- `{addSkill: {group, name}}` → `{skill, skills}`. Name unique in group (an archived one: restore it).
- `{archiveSkill: {skill}}` / `{restoreSkill: {skill}}` → `{skill, skills}`. Archived Skills keep their Assessments but take no new ones.
- `{setTeam: {id?, project, name, members}}` → the team with `id`; new, or replaces `id`. A Trainee is in at most one team per Project.
