# Artifact backend: reads

**`readTrainee(tid, since)`**: `get` `trainees/<tid>`, then with `out_dir`, each query also `where retracted == false` (unless `retracted` asks):
- `trainees/<tid>/evidence` where `date >= since`
- `trainees/<tid>/assessments`, `…/followups`, `…/items`, `…/changes`
- `sensitive` where `trainee == tid` and `date >= since`
- `entries` where `trainees array-contains tid` and `at >= since`

**`readStatus`**: `get` `meta/cycle`, `meta/skills`, `commander/settings`; `list` `trainees` (`limit: 1000`). Today = Now's date. Build from active cards (no `left`): days = calendar days from `lastTalk`; Rating and Trend by the Rating rule from the card's `skills` (Trend vs today − 28 days; `from` = Rating that day); Skill names from `meta/skills`; archived Skills out of `drops` and `shared`.

**`readPlaybook(tid, skills?)`**: Read `data/playbook.json` under the plugin root (`items`); `get` `trainees/<tid>` (refuse unknown), `meta/skills` (refuse unknown Skill ids), `commander/hides`; `list` `playbook`. Pick as store/read.md says, Ratings as of today.

**`takeAlert(pattern?)`**: `get` `meta/alerts` (version, or missing) and do the `readStatus` reads. Build due alerts in order; drop shown ones (`shown[key]` = today for `talk`/`pattern`; any `shown[key]` for `weakness`). None → `{alert: null, more: 0}`, write nothing. Else new `shown` = old minus non-weakness keys not from today and weakness keys whose Skill isn't shared now, plus the first alert's key at today; create `meta/alerts` `{shown}` or `set` it with `if_version`; on a conflict start over. Return `{alert: first, more: others}`.
