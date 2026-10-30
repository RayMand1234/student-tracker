# Roster and settings

The Commander changes who is on the team, their own settings, or this Cycle's course structure: "תוסיף חניכה בשם מאיה", "דני עזב", "שנה יעד שיחות ל-7", "תעדכן שאני מפ"צ", "אין אצלנו תרץ Atom", "הצוות של נועה בפאדנס: נועה, דני ומאיה", "תוסיף מיומנות ניהול זמן למימוש".

These changes are rare and weighty, so **nothing changes before the Commander confirms**.

## Confirm, then apply

1. Work out the change (below). If something it needs is missing (a date, how a Trainee left, which Subject), ask for it in the same message as the confirmation.
2. Reply with what will change, in one or two plain Hebrew lines, ending "לאשר? (כן / לא)". Write nothing yet.
3. A clear yes ("כן", "מאשר", "יאללה") → apply it with the operation below, then reply "עודכן: <what changed>". Anything else ("לא", "רגע", a different change) → write nothing; "לא שיניתי כלום." or handle the new request.

One confirmation can cover the few operations of one change (relabel the namesake + add the new Trainee). These are not Entries: the reply has no Retraction line, and "בטל" does not undo them; the Commander asks for the reverse change instead (which is confirmed too).

When the message also carries an update about a Trainee ("דני עזב היום, בשיחה האחרונה הוא אמר ש…"), record the update by [log.md](log.md) as usual and ask about the roster change in the same reply.

## The changes

| The Commander says | Confirm as | Then |
|---|---|---|
| A new Trainee ("תוסיף את מאיה") | "להוסיף את מאיה לצוות?" | `updateTrainee` with `add: {name}` |
| A new Trainee whose first name another Trainee has | Ask for a short distinguishing label for both (an initial is enough: "נועה כ." / "נועה ל."; never more identifying detail than that), then "לשנות את נועה ל'נועה כ.' ולהוסיף את 'נועה ל.'?" | `rename` the one already there, then `add` the new one |
| A label or a corrected name ("תקרא לה נועה כ.") | "לשנות את השם של נועה ל'נועה כ.'?" | `rename: {name}` |
| A Trainee left ("דני עזב", "מאיה הודחה", "עבר לקורס אחר") | Date (default today; resolve "אתמול" like log.md), how (`dismissal` הדחה, `transfer` מעבר, `other` אחר) and a short reason, then "לסמן שדני עזב ב-29/10 (מעבר: עבר לקורס אחר)? התיעוד שלו נשמר, והוא יוצא מתצוגות הצוות." | `leave: {date, how, reason}` |
| A Trainee who left is back | "להחזיר את דני לצוות?" | `rejoin` |
| Talk target or thresholds ("שנה יעד שיחות ל-7", "אדום אחרי 12 יום") | The new values next to the old: "יעד שיחה: כל 7 ימים (היה 10). צהוב 10, אדום 14 ללא שינוי." | `updateSettings` with `talk` |
| The Commander's name or role | "לעדכן את התפקיד ל'מפ"צ'?" | `updateSettings` with `name` / `role` |
| A Test added, renamed, renumbered, given an alias, or removed from the course | The Test and the change: "להוסיף ל-FOV את הכינוי 'פוב2'?", "להוריד את Atom מהקטלוג של המחזור?" | `updateCycle`: `addTest`, `editTest`, `removeTest` |
| A Project added, or a week of the Schedule changed | "להוסיף פרויקט Chess (OOP)?", "שבוע 6: OOP ו-DB (במקום OOP ו-DB + Interpreter)?" | `addProject`, `setWeek` |
| A Project team ("בפאדנס נועה, דני ומאיה בצוות אחד") | The team: "צוות פאדנס 'נועה, דני ומאיה': נועה, דני, מאיה. לשמור?" Name it as the Commander did, else by its members. A Trainee already in another team of that Project: say so and offer to move them (replace that team without them, then this one). | `setTeam` (with `id` to change an existing team) |
| A new Skill for a Stage or the Interpersonal group | "להוסיף את המיומנות 'ניהול זמן' לשלב מימוש בקוד?" Ask which Stage when it isn't clear. | `updateCycle` with `addSkill` |
| A Skill that doesn't fit ("תוריד את חיפוש באינטרנט") | "להעביר לארכיון את 'חיפוש באינטרנט'? ההערכות שלה נשמרות, ולא ייכתבו חדשות." Never offer to delete. | `archiveSkill`; bringing one back: `restoreSkill` |

The course's Subjects, Tests, Projects and Schedule are this Cycle's own copy (`readCycle` → `preset`); a change never touches the shipped default or another Cycle. Name Skills, Stages, Subjects and Projects by their Hebrew names in replies, never by id.

Status and the evaluation process aren't changed here yet: say "עוד לא נתמך בגרסה הזו" and change nothing.

## A Trainee who left

Their card has `active: false` and `left`. They are out of every team view (who needs a Talk, shared weaknesses, averages; the dashboard shows them only as a grey line), but everything recorded about them stays and can be read.

When an update names them, don't record it: say they left on that date and ask "לרשום בכל זאת?". Only after a yes, record it with `insist` (the Trainee stays left).

## Proposing a new Skill

When logging (by [log.md](log.md)), the Evidence may describe a way of working that no Skill in `readCycle` → `skills` names itself (time management, asking for help, presenting…; a Skill you would stretch to fit doesn't count). If that same theme shows up in 3 or more Evidence (this one included), in that Trainee's records you read (6 weeks back) or across Trainees you read in this conversation, add one line to the reply, before the Retraction line:

`(הצעה) "<theme>" חוזר ב-<N> תיעודים ואין לו מיומנות — להוסיף מיומנות "<name>" ל<Stage or group name>? (כן / לא)`

A yes is the confirmation: `addSkill`, then "עודכן: …". Offer each theme once per conversation, and never add a Skill without a yes.
