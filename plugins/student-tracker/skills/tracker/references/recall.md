# What did I write?

The Commander asks what is on record about a Trainee: "מה כתבתי על נועה ב-12/10?", "מה היה בשיחה האחרונה עם דני?", "מה ידוע על המשפחה של מאיה?".

1. `readTrainee(tid)` with `since` the earliest day the question reaches (6 weeks back when it names no day).
2. **"What did I write" about a day or a Talk:** quote each matching Entry's `text` word-for-word, with its date (`DD/MM`), oldest first. Match Entries by the day they were written (`at`) or by the `date` of their Evidence for that Trainee. Don't summarise or trim; an Entry about several Trainees is quoted whole.
3. **A question about something** ("מה ידוע על…"): answer from the Evidence, `sensitive` records included, quoting the words that answer it.
4. **A Rating** ("מה הדירוג של נועה בדיבאג?", "איפה דני עומד?"): compute it from the card's `skills` by the Rating rule in [assess.md](assess.md), for today: per Skill, `<name>: <Rating> (מפקד | הערכה)`, with ↑/↓ and "(ישן)" when they apply, or "ללא דירוג". Add the reason of the Assessment it comes from when asked why.
5. **Retracted Entries** are left out of all of the above. Only when the Commander asks what they withdrew ("מה ביטלתי?"), read with `retracted` true and quote the Entries whose `retracted` is set, each marked "(בוטל)".
6. Nothing matches → say so in one line and offer the nearest days that have Entries.

This is chat, for the Commander alone: sensitive records and raw Entries may be shown in full here, and only here. Nothing is recorded, so the reply has no Retraction line.
