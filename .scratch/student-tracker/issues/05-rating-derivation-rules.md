# How does the agent turn Evidence into a 1–5 Rating?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: raymandelvei
Blocked by: 03

## Question

Given the domain model from "What is the domain model of Trainees, Evidence and Ratings?" (03), decide the rules: what each of 1–5 means (anchors per level), minimum evidence before leaving gray, recency weighting vs full history, when a Rating is recomputed (every update vs on demand), how trend (improving/regressing) is derived and shown, how a Commander override decays or persists when new Evidence arrives, and how the agent explains a Rating change to the Commander.

Also fix the edges of the Playbook level bands (low 1–2 / mid 3 / high 4–5 per "What does the Playbook look like and where does its base content come from?" (04)) if the anchors suggest different cut points.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, 15 questions, all accepted). Terms **Rating**, **Trend** and **Stale Rating** are defined in `GLOSSARY.md`; these are the rules.

```
Assessment ─ whole number 1–5, author agent | Commander | Trainee, reason, → ≥1 Evidence, dated, immutable
Rating(Trainee × Skill) =
  if any Commander Assessment exists → latest Commander Assessment
  else                               → latest agent Assessment
  else                               → unrated (gray)
  (Trainee-authored Assessments never count)
  + evidence count · Trend (vs Rating as of 4 weeks earlier) · stale flag (> 6 weeks since latest counting Assessment)
```

Decisions:
1. **One shared scale** for every Skill: 1 לא מתפקד · 2 מתקשה, צריך ליווי צמוד · 3 סביר, עם טעויות · 4 טוב ועצמאי · 5 מצוין, יכול ללמד אחרים. No per-Skill anchor tables; base Playbook signs are the per-Skill recognition cues.
2. **Assess only what the Evidence speaks to.** No sweep of all Skills per Entry. Agent Assessments are recorded at once, with no confirmation step; the Commander corrects by replying.
3. **Holistic Assessment, simple Rating.** Each new agent Assessment judges the whole picture (recent ~4 weeks weighted most, full history as context) and cites the Evidence it used. The Rating is the latest Assessment that counts, with no averaging.
4. **Whole numbers only** for Assessments and Ratings.
5. **Test scores alone are not Skill Evidence.** Only descriptive text about how the Trainee worked yields an Assessment; scores stay on the test Evidence for test views and stats.
6. **Self-assessment gap.** A רמ"ת self-score ≥2 away from the Rating on the same Skill → agent Assessment on מודעות עצמית citing the form and the gap direction. A gap ≤1 is shown only.
7. **Leaving gray**: on the first Assessment from the agent or the Commander, even with one Evidence. The Rating carries its Evidence count; the dashboard decides whether to show a thin-evidence marker.
8. **Commander override is sticky.** Once the Commander has assessed a Skill, only Commander Assessments count. Later agent Assessments are stored but don't count. When the agent's judgment differs by ≥1, it proposes the change "(הצעה)" in the confirmation line; acceptance records a new Commander Assessment. There is no "release override" action.
9. **Trend** = current Rating vs Rating 4 weeks earlier (rebuilt from dated Assessments): ↑ / ↓ / none, with no arrow when there was no Rating then. "Declining" in the Advice rule means ↓.
10. **No decay.** A Rating whose latest counting Assessment is >6 weeks old is stale: same value, shown faded.
11. **Re-rating triggers**: each Entry (Skills it touches); the Commander asks "תדרג מחדש את X" (review every Skill with Evidence, write only where judgment changed); a clarification corrects backing Evidence (re-assess the Skills it touched). No scheduled recompute.
12. **Direct Commander ratings are Entries.** "הדיבאג של X זה 4" becomes note Evidence, and the Commander Assessment rests on it.
13. **Explaining**: the confirmation line lists every Assessment written, one line each: `דיבאג 2→3 (הערכה): <reason> — <Evidence kind + date>`, `תקשורת: נשאר 3 (הערכה)`, `—→3` for a first Rating; agent proposals against a Commander value appear as "(הצעה) מציע לעדכן …".
14. **Playbook band edges unchanged**: low 1–2 / mid 3 / high 4–5. An unrated Skill gets only untagged items.

Knock-on effects recorded on other tickets: the storage mapping must keep every Assessment (counting or not) dated and queryable per Trainee × Skill, so Rating, Trend and stale can be derived; the dashboard shows Trend arrows, stale fading, and possibly a thin-evidence marker; the confirmation-line format feeds the "Output formats" fog.
