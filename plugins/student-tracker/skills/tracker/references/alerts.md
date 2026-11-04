**Load:** read

# Proactive alerts

At most one short line the Commander should notice unasked.

1. **Pattern?** Only if this reply recorded Evidence about a Trainee: does one specific difficulty or behaviour (late again, stuck without asking again, same mistake in a third Test) now stand in ≥3 of their Evidence, this Entry included (6 weeks of `read-trainee`; read it if you haven't)? Name the theme in 2–3 plain, display-safe words ("הגשות באיחור"), the same words each time. A Skill already rated low is not a pattern by itself.
2. `take-alert`, or `take-alert <tid> <theme>` if you found a pattern.
3. `alert` null → no line, say nothing about it. Else one line, just before `לביטול: 'בטל'` (or last if there is none):
   - Talk: `⚠ אור 22 ימים בלי שיחה (אדום)` / `(צהוב)`; `noTalk`: `⚠ מאיה טרם שיחה (50 ימים מתחילת המחזור)`.
   - Weakness: `⚠ חולשה משותפת: סדר וארגון — דני, אור, עידו`.
   - Pattern: `⚠ נועה: הגשות באיחור — פעם שלישית`.
   - `more` > 0: append ` · +<more> ב'מה המצב'`.

Only that line: no explanation, no advice, nothing sensitive.
