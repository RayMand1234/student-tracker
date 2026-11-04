**Load:** read

# What did I write?

1. `read-trainee <tid> --since <earliest day asked about (default 6 weeks back)>`.
2. **About a day or a Talk** ("מה כתבתי על נועה ב-12/10?"): quote each matching Entry's `text` whole and word-for-word, with its `DD/MM`, oldest first. An Entry matches by its `at` day or by the `date` of its Evidence for that Trainee.
3. **About something** ("מה ידוע על…"): answer from the Evidence, `sensitive` included, quoting the words that answer it.
4. **A Rating** ("מה הדירוג של נועה בדיבאג?", "איפה דני עומד?"): from the card's `skills[id].a`, as of today: the last `commander` entry if any, else the last; ↑/↓ vs. the Rating 28 days ago (none if equal or unrated then); "(ישן)" if its Assessment is >42 days old. Per Skill: `<name>: <Rating> (מפקד | הערכה)`, or "ללא דירוג". Asked why → its Assessment's reason.
5. Retracted Entries are left out, except when asked what was withdrawn ("מה ביטלתי?"): read with `--retracted` and quote those with `retracted` set, each marked "(בוטל)".
6. No match → say so in one line, offer the nearest days with Entries.

Sensitive records and raw Entries may be shown in full here (only here). No Retraction line.

## An earlier Cycle ("במחזור הקודם", "במחזור הצהובים")

- Address: "the previous Cycle" = `read-cycle` → `cycle.previous`. By name: `read-cycle` at each address in the pointer's `archived`, take the match; none → list the Cycles by name.
- Run every read at its address (the backend file says how): `read-cycle`, `read-team` (find the Trainee by name; ids differ per Cycle), then `read-trainee` with no `--since`. Answer as above, naming the Cycle ("במחזור הצהובים: …"). Never write to it.
