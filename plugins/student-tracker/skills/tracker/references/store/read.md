# Store: reads

- `read-trainee <tid> [--since YYYY-MM-DD] [--retracted]` → `{card, evidence, assessments, followups, items, changes, sensitive, entries}`. `--since` limits records by the day they happened (Entries by the day written); no `--since` = everything. `--retracted` adds withdrawn records: only to find a retracted Entry, or when asked what was withdrawn.
- `read-status` → `{cycle, week, active, needTalk, declining, shared, fine}`, active Trainees as of today, each list already in order:
  - `needTalk` `[{id, name, days, level}]` (`days` null = no Talk yet; `level` yellow/red)
  - `declining` `[{id, name, drops: [{skill, name, from, to}], status, evalStage}]`
  - `shared` `[{skill, name, trainees: [{id, name, score}]}]`: Skills rated ≤2 for ≥3 Trainees
  - `fine`: the other names
- `read-playbook <tid> [<skill id> …]` → `{targets: [{skill, name, rating, trend, focus, items}], general: [items]}`. Item: `{id, origin: base|commander, kind: sign|tip|exercise|talk-question, skills, band, text}`. With no Skills: the Trainee's falling, then lowest-rated Skills, max 3.
- `take-alert [<tid> <theme words…>]` → `{alert, more}`: the one alert due for this reply, marked shown today; `more` = others due. `alert` is null or one of `{kind: "talk", level, name, days, noTalk}`, `{kind: "weakness", name, trainees: [{id, name, score}]}`, `{kind: "pattern", name, theme}`.
