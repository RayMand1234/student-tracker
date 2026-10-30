# Team status

"מה המצב", "סטטוס", "מה המצב בצוות?", `/student-tracker:status`: the whole team at a glance, so the Commander can plan the week. (A question about one Trainee, "מה המצב עם נועה", is a brief: [brief.md](brief.md).)

1. `readStatus`. It gives the lists already worked out (active Trainees only; those who left are never listed):
   - `needTalk`: no Talk yet (`days: null`), or at or past the Commander's yellow threshold, reddest first, each with `level` `red` / `yellow` by the Commander's own settings;
   - `declining`: a Rating ↓ against 4 weeks ago (`drops`, `from`→`to`), or Status `concern`, or in the evaluation process (`evalStage`);
   - `shared`: a Skill rated 2 or below for 3 or more Trainees, two at most;
   - `fine`: everyone else.
2. **One team action, always**: one short, concrete thing for the whole team this week ("להקדיש 10 דק' בתרגול לתכנון שבועי"), aimed at the first of these that applies: the shared weakness, the most common thread of `declining`, the Talks owed in `needTalk` ("לקבוע השבוע שיחות עם אור ועידו"), else whatever the team's Evidence most needs. A Playbook item may be its source (`readPlaybook` of one of the Trainees concerned: that Skill's items and the `general` ones); rewrite it to the team. Marked (הצעה); never stored.
3. **Reply** in this layout, plain lines as shown (no bold, no Markdown headings, nothing added around it). A list with nothing in it is left out; the team action is always there; the `בסדר` line is last.

```
מחזור הצהובים · שבוע 8 · 6 חניכים

צריכים שיחה
• מאיה — טרם שיחה
• אור — 22 ימים (אדום)
• עידו — 16 ימים (צהוב)

בירידה
• דני — שקדנות 3→1, דורש טיפול, רף מקס
• אור — תקשורת 4→3

חולשה משותפת
• עמידה בזמנים — דני, אור, עידו (2 ומטה)

פעולה לצוות (הצעה)
להקדיש 10 דק' בתרגול לתכנון שבועי.

בסדר: נועה, אביגיל
```

- Header: `מחזור <cycle> · שבוע <week> · <active> חניכים`.
- `בירידה`: per Trainee, each drop `<Skill> <from>→<to>`, then `דורש טיפול` when that is their Status, then the stage, comma-separated.
- `חולשה משותפת`: `<Skill> — <names> (2 ומטה)`.
- Nothing to flag at all → the header, then `כולם בסדר: <names>.`, then the team action.

Nothing is recorded: no Retraction line, and no alert line (this reply already shows everything an alert would).
