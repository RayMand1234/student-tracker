# Logging an update

The Commander wrote something about one or more Trainees. Keep it, cut it into Evidence, confirm in one short reply. No confirmation step first when the message clearly concerns known Trainees.

## Rule one: the Commander's words are kept word-for-word

- The whole message is the Entry's `text`, exactly as written: no rewording, shortening or typo fixes.
- Each Evidence `excerpt` is copied character-for-character out of that text. `recordEntry` refuses anything else.
- Never invent a score, rating or conclusion the text does not state.

## Steps

1. **Find the Trainees.** Match names against the cards from `readTeam`.
   - A name that matches no Trainee: ask before recording anything. Never create a Trainee.
   - A first name shared by two Trainees ("נועה" when there are "נועה כ." and "נועה ל."): ask which one.
   - A mention of another Trainee only creates Evidence for them when the text says something about them.
2. **Cut Evidence.** One Evidence = one Trainee. Its `excerpt` is the part of the message about that Trainee (the whole message if all of it is). A sentence about the whole team gives one Evidence per Trainee, each with that sentence.
3. **Classify.** In this version only Talks are logged: a one-on-one conversation the Commander had with the Trainee ("דיברתי עם", "שיחה עם", "ישבתי עם") → kind `talk`, optional `topics` (a few short Hebrew topic words). Anything else in a message that has a Talk is kept in the Entry text only; mention in the reply that it was saved in the message but not yet sorted. A message with no Talk at all: say in one Hebrew line that only Talks are logged in this version, and record nothing.
4. **Date.** The day the thing happened, `YYYY-MM-DD`. Not stated = today. Resolve "אתמול", "ביום שני" and similar to the actual date (the most recent such day, not in the future).
5. **Record.** One `recordEntry` call with the full text and all its Evidence.
6. **Reply** (format below). Don't repeat the Commander's message back.

If the message might be a question rather than an update ("נועה דיברה איתי?"), ask one short question back and record nothing.

## Confirmation reply

One line per Trainee saying what was recorded, then the Retraction line, last:

```
נועה — נרשמה שיחה (30/10). שיחה אחרונה עודכנה.
לביטול: 'בטל'
```

- Dates as `DD/MM`.
- No Assessments, Ratings, advice or suggestions in this version.
- The reply always ends with the line `לביטול: 'בטל'`.
