**Load:** roster

# Trainee state

All you write here is display-safe ("מצב אישי" at most). With an Entry, it goes in its `recordEntry` call (`items`, `changes`).

## Status

| Status | When |
|---|---|
| `good` במסלול | Ratings steady or rising, tasks done, nothing worrying |
| `watch` במעקב | A Skill ↓ or at 2, missed submissions, a Follow-up undone twice, a failed Test, a personal matter weighing on them |
| `concern` דורש טיפול | Several Skills at 1–2 or ↓, repeated failures, not functioning, serious distress, in the evaluation process |

- **Judge it with every Entry** about the Trainee (card + 6 weeks of `readTrainee`); move it only for a real reason, never one bad day. First Status once there is a Talk or two Evidence.
- **Yours**: a `status` change, one-sentence Hebrew `reason`, written at once.
- **Card `status.by` is `commander`** → instead add the proposal line (below). On yes: `updateTrainee` with `status: {to, reason: "אישור הצעה: <your reason>", evidence: <the Evidence ids it cited>}`, reply `עודכן: <name> — <Status in Hebrew> (מפקד).` Otherwise record nothing.
- **The Commander sets it** ("תעביר את דני לדורש טיפול"): ask `לשנות את הסטטוס של דני ל'דורש טיפול' (היה: במעקב)? (כן / לא)`, write nothing yet. On a clear yes: `updateTrainee` with `status: {to, reason, evidence}`: reason = their words in brief, or "החלטת המפקד" (don't ask); evidence = stored Evidence ids they point to, if any. Message also carries an update about them → record it first (read [log.md](log.md)), ask in the same reply, after the yes cite that Evidence.

## Evaluation process

Stages in order: רף מקס → רף רמד → רף מפקד היחידה → הדחה.

- Never change the stage or propose entering or moving it yourself, however the Evidence looks.
- **The Commander gives a stage** ("נועה עלתה לרף מקס", "סיימה את תהליך ההערכה, השתפרה") or describes an event at a stage other than the card's `evalStage`: ask, record **nothing**: `לעדכן את שלב תהליך ההערכה של נועה ל'רף מקס' (היה: —)? (כן / לא)`. Clear yes → record their original message as the Entry (read [log.md](log.md) unless already read): the sentence as `evaluation-event` Evidence, plus a `stage` change citing it (`to: null` = left the process). Otherwise record nothing: `לא שיניתי כלום.`
- An event at the current stage (a talk within רף מקס): ordinary `evaluation-event` Evidence, no question.
- `הדחה` doesn't take them off the team. Dismissed and leaving → a separate `leave` (`dismissal`), confirmed on its own (read [roster.md](roster.md) only then).
- Not sensitive by default.

## Snapshot

With every Entry, a fresh `snapshot` per Trainee it's about, unless theirs already says it: 1–2 short Hebrew sentences (main strength, main difficulty, direction) from card, 6 weeks of `readTrainee` and this Entry; only what Evidence supports. Not in the reply.

## Improve/keep items (שיפור / שימור)

- **The Commander's**: each feedback point ("שיפור: להגיע בזמן. שימור: עוזרת לחברים", "שתמשיך לשאול שאלות") → own item, `by: commander`, `text` word-for-word minus the "שיפור:" label, `from` the Evidence (or sensitive part) holding it.
- **Yours**: ≤1 per Trainee per Entry, a clear, specific point no active item covers; `by: agent`, your short words; reply marks it "(הצעה)".
- **Retiring**: Commander says a point is done ("היא כבר מגיעה בזמן, אפשר להוריד את זה") → `retired` `by: commander`, citing their words (as `note` Evidence if nothing else holds them) (load `record`). Retire your own (`by: agent`) once later Evidence settles or replaces them; never a Commander's. Unclear which → ask, listing active ones.

## Reply lines

After the Trainee's Assessment lines:

```
  סטטוס: במסלול → במעקב (הערכה): לא הגישה שבוע שני — שיחה 30/10
  (הצעה) מציע לשנות סטטוס: דורש טיפול → במעקב: הגישה הכל השבוע — שיחה 30/10. לשנות?
  תהליך הערכה: — → רף מקס (מפקד)
  לשיפור: "להגיע בזמן לתרגולים"
  לשימור (הצעה): מקבלת משוב בפתיחות
  הוסר: "להגיע בזמן לתרגולים"
```

A Status via `updateTrainee` is not an Entry: reply `עודכן: …`, no Retraction line.
