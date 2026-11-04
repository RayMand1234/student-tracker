**Load:** read, record

# Assessments and Ratings

You write Assessments, never a Rating.

Scale: 1 לא מתפקד · 2 מתקשה, צריך ליווי צמוד · 3 סביר, עם טעויות · 4 טוב ועצמאי · 5 מצוין, יכול ללמד אחרים.

Name Skills by `name` (`read-cycle` → `skills`).

## Rating rule

From the card's `skills[id].a`, on a given day (today: `date '+%F'`):

- **Rating** = among entries dated on or before that day, the last `commander` one if any, else the last one. None → unrated ("—").
- **Trend** = vs. the Rating 28 days ago: ↑/↓; none when equal or unrated then.
- **Stale** = its source Assessment is >42 days old: keep the value, say "(ישן)".

Example, today 30/10, `a` = `[["2026-09-20", 2, "agent"], ["2026-10-10", 4, "commander"], ["2026-10-25", 2, "agent"]]`: Rating 4 (the Commander's), ↑ against 2 on 02/10, not stale.

## Agent Assessments

- Only on Skills the Evidence speaks to ("מצאה לבד את הבאג עם הדפסות" → יכולות דיבאג, עצמאות), usually 0–3. Never sweep all Skills or guess.
- A test score alone is not Skill Evidence ("קיבל 85 בפוב", "עבר את פוב", "נכשלה בתרץ 2" → none). A test or code review describing how they worked ("נתקע שעה על הדיבאג בפוב") may be.
- Holistic: `read-trainee` (6 weeks) and the card's Skill entry, last ~4 weeks weighed most; score where they stand now.
- Cite every Evidence used (≥1): this Entry's as `#<n>` (Evidence in order, then sensitive parts), earlier ones by id.
- Reason: one short Hebrew sentence, display-safe ("מצב אישי" at most).
- Write at once, no confirmation.

## Commander's Assessment

"הדיבאג של נועה זה 4", "תעדכן את העבודת צוות של דני ל-3": the sentence is its own `note` Evidence, cited (`#<n>`) by a `commander` Assessment with that score, reason = their words in brief. No agent Assessment on that Skill in that Entry.

## Commander-set Rating (its source is a `commander` Assessment)

Evidence speaks to it → still write yours (kept, doesn't count):
- Same score → a "נשאר" line.
- Different score → a proposal line "(הצעה) מציע לעדכן …" ending "לעדכן?". On yes ("כן", "תעדכן", "מאשר"): `record-assessments` for that Trainee with one `commander` Assessment: the proposed score, the Evidence your proposal cited, reason "אישור הצעה: <your reason>", plus fresh next-Talk questions (read [advice.md](advice.md) for them). Reply with its line. Otherwise record nothing.

## Self-assessment (רמ"ת)

- Each self-scored Skill → a `trainee` Assessment citing the `self-assessment` Evidence, reason "רמ"ת".
- Gap ≥2 between a self-score and the Skill's Rating (after this Entry's other Assessments) → one agent Assessment on מודעות עצמית (`learn.self-awareness`), citing the form and the Evidence behind those Ratings; reason names each such Skill and direction ("מעריכה את עצמה גבוה מהדירוג ביכולות דיבאג: 5 מול 2"); score = your holistic judgment of their self-awareness. Otherwise nothing.
- The form's descriptive text counts as Evidence too.

## Corrections

A `clarification` correcting an Evidence cited by the Trainee's Assessments (`read-trainee` → `assessments`): in the same Entry, a fresh agent Assessment on each of those Skills, citing the clarification and what still stands (proposal rule if Commander-set).

## "תדרג מחדש את X"

1. `read-trainee <tid>` with no `--since`.
2. Judge every Skill some Evidence speaks to.
3. Write only where you differ from the Rating, or it is unrated: one `record-assessments` call with all, plus fresh next-Talk questions (read [advice.md](advice.md) for them). Commander-set → proposal.
4. Reply: one line per Assessment written, then "ללא שינוי: <Skill names>". Nothing written → "עברתי על כל המיומנויות — אין שינוי."

## Reply lines

Under the Trainee's confirmation line; arrow = Rating before → after:

```
  יכולות דיבאג 2→3 (הערכה): מצאה לבד את הבאג עם הדפסות — שיחה 30/10
  תקשורת: נשאר 3 (הערכה) — שיחה 30/10
  עבודת צוות —→4 (הערכה): הובילה את החלוקה למשימות — תצפית Padens 29/10
  יכולות דיבאג 3→4 (מפקד): המפקד קבע 4 — הערה 30/10
  (הצעה) מציע לעדכן יכולות דיבאג 4→2: נתקעת על כל באג ומחכה לעזרה — שיחה 30/10. לעדכן?
  יכולות דיבאג: 5 (הערכה עצמית) — רמ"ת 30/10
```

- `(הערכה)` = yours; `(מפקד)` = the Commander's, or yours matching a Commander-set Rating. `—` = unrated before. In a proposal the arrow is Commander-set Rating → your score.
- `— <kind> <DD/MM>`: newest Evidence cited (שיחה, תרץ, סקד, תצפית <Project>, רמ"ת, שיפור/שימור, הערה, תיקון…).
- Resting only on Evidence older than the Skill's latest Assessment → Rating unchanged: write "נשאר" and say why ("מבוסס על תיעוד ישן מ-15/10").
- No Advice on these lines.
