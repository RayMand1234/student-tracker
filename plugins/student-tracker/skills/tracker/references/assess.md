# Assessments and Ratings

An **Assessment** is one dated judgment of a Trainee on one Skill: a whole number 1–5, its author (`agent`, `commander` or `trainee`), a reason, and the Evidence it rests on. It is never edited; a later judgment is a new Assessment. A **Rating** is what the Assessments add up to now, by the rule below. You write Assessments; you never store a Rating.

## The scale (every Skill)

| | |
|---|---|
| 1 | לא מתפקד |
| 2 | מתקשה, צריך ליווי צמוד |
| 3 | סביר, עם טעויות |
| 4 | טוב ועצמאי |
| 5 | מצוין, יכול ללמד אחרים |

Skills are the ids in `meta/skills` (from `readCycle`): four Stages and the Interpersonal group. Name a Skill in replies by its `name` there.

## The Rating rule

The card's `skills` holds, per Skill id, `a`: the Assessments that count, as `[date, score, author]`, oldest first (same day: the one written last is last), and `n`: how many Evidence back them. A Trainee's own Assessments are never in `a`; neither are the agent's after the Commander has assessed that Skill.

On a given day (today: `date '+%F'`):

- **Rating** = among the entries of `a` dated on or before that day: the last one by the Commander if there is any, else the last one. None → unrated ("—").
- **Trend** = Rating today compared with the Rating as of 28 days ago: ↑ higher, ↓ lower, no arrow when equal or when it was unrated then.
- **Stale** = the Assessment the Rating comes from is more than 42 days old. It keeps its value; say "(ישן)".

Example, today 30/10, `a` = `[["2026-09-20", 2, "agent"], ["2026-10-10", 4, "commander"], ["2026-10-25", 2, "agent"]]`: the Rating is 4 (the Commander's), ↑ against 2 on 02/10, not stale.

## When to write an agent Assessment

- **Only on Skills the Evidence speaks to**: what the text says about how the Trainee worked ("מצאה לבד את הבאג עם הדפסות" speaks to יכולות דיבאג and עצמאות). Usually zero to three Skills per Evidence. Never sweep all Skills, never guess one the text doesn't touch.
- **A test score alone is not Skill Evidence.** "קיבל 85 בפוב", "עבר את פוב", "נכשלה בתרץ 2" produce no Assessment. A test or code review that describes how they worked ("נתקע שעה על הדיבאג בפוב") may.
- **Holistic.** Before judging, `readTrainee` (6 weeks back) for the Trainee and look at their Evidence on that Skill and its card entry: weigh the last ~4 weeks most, use older history as context. The score is your judgment of where they stand now, not of this one Evidence.
- **Cite** every Evidence you used: in the Entry being recorded as `#<n>` (its numbering in the Entry: the Evidence first, in order, then the sensitive parts), earlier ones by id. At least one.
- **Reason**: one short Hebrew sentence on why, display-safe: never a word of a sensitive part (cite it by id only; "מצב אישי" at most).
- Written at once, with no confirmation step. The Commander corrects by replying.
- One Assessment per Skill per author per Trainee in one call.

## The Commander's own Assessment

"הדיבאג של נועה זה 4", "תעדכן את העבודת צוות של דני ל-3": the sentence is cut as its own `note` Evidence (word-for-word, as always), and a `commander` Assessment with that score cites it (`#<n>`), reason = what the Commander said, briefly. Write no agent Assessment on that Skill in the same Entry. From now on only the Commander's Assessments count for that Skill.

## Against a Commander-set Rating: propose, don't overrule

A Commander-set Rating is one that comes from a Commander Assessment. When the Skill's Rating is Commander-set and the Evidence speaks to it, still write your agent Assessment: it is kept but doesn't count.

- Same score → the line says it stays (below).
- A different score → the line is a proposal, "(הצעה) מציע לעדכן …", ending with the question "לעדכן?". If the Commander accepts ("כן", "תעדכן", "מאשר"), `recordAssessments` for that Trainee: one `commander` Assessment with the proposed score, the same Evidence your proposal cited, reason "אישור הצעה: <your reason>", and fresh next-Talk questions ([advice.md](advice.md)). Reply with its line; if they decline, record nothing.

## Self-assessment (רמ"ת)

- The form is a `self-assessment` Evidence. Each Skill the Trainee scored becomes a `trainee` Assessment with their score, citing that Evidence (reason: "רמ"ת"). These never count.
- **Gap.** Compare each self-score with the Skill's Rating (after this Entry's other Assessments). A gap of 2 or more on any Skill → one agent Assessment on מודעות עצמית (`learn.self-awareness`) citing the form and the Evidence behind those Ratings; its reason names each such Skill and the direction ("מעריכה את עצמה גבוה מהדירוג ביכולות דיבאג: 5 מול 2"). Its score is your holistic judgment of their self-awareness. A gap of 1 or less, or an unrated Skill, yields nothing.
- The form's descriptive text (what they wrote about how they work) may also speak to Skills, like any Evidence.

## A correction re-assesses

A `clarification` that corrects an Evidence cited by any of the Trainee's Assessments (`readTrainee` → `assessments`, `evidence` includes its id): in the same Entry, write a fresh agent Assessment on each Skill those Assessments are on, citing the clarification and what still stands. Skills whose Rating is the Commander's follow the proposal rule.

## "תדרג מחדש את X"

1. `readTrainee(tid)` with no `since`: the whole history.
2. For every Skill some Evidence speaks to (those on the card and any the Evidence touches that has none yet), judge holistically as above.
3. Write only where your judgment differs from the current Rating, or the Skill is unrated: one `recordAssessments` call with all of them, each citing its Evidence, plus fresh next-Talk questions ([advice.md](advice.md)). Against a Commander-set Rating, the difference is a proposal.
4. Reply: one line per Assessment written (below), then "ללא שינוי: <Skill names>" for the rest. Nothing written → "עברתי על כל המיומנויות — אין שינוי."

## Lines in the reply

One line per Assessment written, under that Trainee's confirmation line, Skill by its `name`; the arrow shows the Rating before → after:

```
  יכולות דיבאג 2→3 (הערכה): מצאה לבד את הבאג עם הדפסות — שיחה 30/10
  תקשורת: נשאר 3 (הערכה) — שיחה 30/10
  עבודת צוות —→4 (הערכה): הובילה את החלוקה למשימות — תצפית Padens 29/10
  יכולות דיבאג 3→4 (מפקד): המפקד קבע 4 — הערה 30/10
  קבלת ביקורת: נשאר 4 (מפקד) — שיחה 30/10
  (הצעה) מציע לעדכן יכולות דיבאג 4→2: נתקעת על כל באג ומחכה לעזרה — שיחה 30/10. לעדכן?
  יכולות דיבאג: 5 (הערכה עצמית) — רמ"ת 30/10
  עבודת צוות: 3 (הערכה עצמית) — רמ"ת 30/10
```

- `(הערכה)` for yours, `(מפקד)` for the Commander's, and for yours when it matches a Commander-set Rating. `—` = unrated before. In a proposal the arrow is the Commander-set Rating → your score.
- `— <Evidence kind> <DD/MM>` names the Evidence it rests on (the newest if several): שיחה, תרץ, סקד, תצפית <Project>, רמ"ת, שיפור/שימור, הערה, תיקון…
- A Trainee's own Assessment shows only their score, "(הערכה עצמית)": it changes no Rating.
- The arrow is the Rating before → after this write, by the rule. An Assessment resting only on Evidence older than the Skill's latest Assessment slots in behind it and leaves the Rating as it was: write "נשאר" and say why ("מבוסס על תיעוד ישן מ-15/10").
- No Advice on these lines.
