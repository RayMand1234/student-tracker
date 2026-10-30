# Proactive alerts

Something the Commander should notice without asking rides on your reply as at most one short line. Every reply of this skill gets the check, except the brief, team status ("מה המצב" already shows all of it), a reply that only asks the Commander a question and records nothing (which Trainee, "לאשר? (כן / לא)": the alert waits for the next reply), and a reply that stopped before `readTeam` (no tracking, setup unfinished).

1. **A pattern?** Only when this reply recorded Evidence about a Trainee: does the same specific difficulty or behaviour (late again, stuck without asking again, the same mistake in a third Test) now stand in 3 or more of that Trainee's Evidence, this Entry's included (the 6 weeks of `readTrainee` you read; read it if you haven't)? Then it is a pattern. Name its theme in two or three plain, display-safe words ("הגשות באיחור"), the same words each time you see that theme. A Skill they are already rated low on is not a pattern by itself.
2. `takeAlert`, with the pattern (`trainee`, `theme`) if you found one. It gives the one alert due now, if any, in priority order (a red overdue Talk, a weakness newly shared by 3+ Trainees, your pattern, a yellow overdue Talk), already left out when any conversation showed it today, and `more`: how many others are due. It remembers that this one was shown.
3. `alert` is null → no line. Otherwise one line, placed just before `לביטול: 'בטל'`, or last when the reply has no Retraction line:
   - Talk: `⚠ אור 22 ימים בלי שיחה (אדום)`; `(צהוב)` for yellow; with `noTalk`, `⚠ מאיה טרם שיחה (50 ימים מתחילת המחזור)`.
   - Shared weakness: `⚠ חולשה משותפת: סדר וארגון — דני, אור, עידו`.
   - Pattern: `⚠ נועה: הגשות באיחור — פעם שלישית`.
   - `more` above 0: add ` · +<more> ב'מה המצב'`.

```
נועה — שיחה (30/10).
  יכולות דיבאג 2→3 (הערכה): מצאה לבד את הבאג
⚠ אור 22 ימים בלי שיחה (אדום) · +2 ב'מה המצב'
לביטול: 'בטל'
```

Only this one line: no explanation, no Advice, nothing sensitive.
