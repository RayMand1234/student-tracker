# Haiku by default; an Opus analyst agent for judgment-heavy routes

Most tracker turns read the store or record what the Commander said word for word. That doesn't need a strong model. So the tracker and the `brief`, `status` and `dashboard` shortcuts set `model: haiku`. Re-rating, online research and advice on one Trainee need more judgment. Those three routes (★ in the tracker's Route table) go to the plugin agent `student-tracker:analyst`, which runs on `model: opus`. The `/research` shortcut sets `model: opus` and runs its route inline.

The Assessments written while logging an update (0–3 Skills the Evidence speaks to) stay on Haiku. Most updates touch a Skill, so sending them to Opus would cancel most of the savings. Accepting a suggestion, answering a "לעדכן?" proposal and retractions are writes, so they stay on Haiku too.

## Considered Options

- **Model per skill only**: a skill's `model:` lasts for the rest of the turn, and one tracker skill serves every route, so it can't switch models per route. Rejected.
- **Main thread on the session model, cheap work sent to a Haiku subagent**: the expensive model would still run every turn. Rejected.
- **Sonnet as the cheap model**: safer on the word-for-word and sensitive-cutting rules. The Commander chose Haiku, with the eval suite as the check.

## Consequences

- The analyst can't see the chat. The tracker passes it the message word for word, plus the earlier lines it depends on. The analyst's reply comes back into the main chat, so follow-ups ("כן, את השנייה") work there as before.
- Run the full eval suite before release. Each turn's model comes from the skill frontmatter, so `EVAL_MODEL` no longer decides it.
- The docs don't say whether Claude Cowork honours a skill's `model:`. Where it doesn't, the session model runs.
