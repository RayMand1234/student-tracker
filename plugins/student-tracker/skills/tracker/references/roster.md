**Load:** roster

# Roster and settings

## Confirm, then apply

1. Say what will change (table) in 1–2 plain Hebrew lines ending "לאשר? (כן / לא)", asking in the same message for anything missing (date, how a Trainee left, which Subject). Write nothing yet.
2. Clear yes ("כן", "מאשר", "יאללה") → apply, reply "עודכן: <what changed>". Anything else → write nothing; "לא שיניתי כלום." or handle the new request.

- One confirmation may cover the few operations of one change (relabel the namesake + add the new Trainee).
- Not Entries: no Retraction line; "בטל" doesn't undo them (the reverse is a new, confirmed change).
- Message also carries an update about a Trainee → record it (read [log.md](log.md)) and ask about the roster change in the same reply.
- Name Skills, Stages, Subjects and Projects in Hebrew, never by id.

## The changes

| The Commander says | Confirm as | Then |
|---|---|---|
| A new Trainee | "להוסיף את מאיה לצוות?" | `update-trainee` `add:` |
| A new Trainee whose first name another has | Ask a label for both (an initial at most: "נועה כ." / "נועה ל."), then "לשנות את נועה ל'נועה כ.' ולהוסיף את 'נועה ל.'?" | `rename` the existing one, then `add` |
| A label or corrected name | "לשנות את השם של נועה ל'נועה כ.'?" | `rename:` |
| A Trainee left | Date (default today; resolve "אתמול" to a date), how (`dismissal` הדחה, `transfer` מעבר, `other` אחר), short reason, then "לסמן שדני עזב ב-29/10 (מעבר: עבר לקורס אחר)? התיעוד שלו נשמר, והוא יוצא מתצוגות הצוות." | `leave:`, `how:`, `reason:` |
| A Trainee who left is back | "להחזיר את דני לצוות?" | `rejoin` |
| Talk target or thresholds | New values beside old: "יעד שיחה: כל 7 ימים (היה 10). צהוב 10, אדום 14 ללא שינוי." | `update-settings` `talk` |
| The Commander's name or role | "לעדכן את התפקיד ל'מפ"צ'?" | `update-settings` `name` / `role` |
| A Test added, renamed, renumbered, aliased or removed | "להוסיף ל-FOV את הכינוי 'פוב2'?" | `update-cycle` `add-test` / `edit-test` / `remove-test` |
| A Project added or removed; a Schedule week changed or dropped | "להוסיף פרויקט Chess (OOP)?", "שבוע 6: OOP ו-DB (במקום OOP ו-DB + Interpreter)?", "הקורס 20 שבועות: להוריד את שבוע 21?" | `add-project`, `remove-project`, `week`, `remove-week` |
| A Project team | "צוות פאדנס 'נועה, דני ומאיה': נועה, דני, מאיה. לשמור?" Named as the Commander did, else by members. A member already in another team of that Project: say so, offer to move them (replace that team without them, then this one). | `team` (with `id` to change one) |
| A new Skill for a Stage or the Interpersonal group | "להוסיף את המיומנות 'ניהול זמן' לשלב מימוש בקוד?" Ask which Stage if unclear. | `add-skill`, then offer draft Playbook items (read [playbook.md](playbook.md)) |
| Removing a Skill | "להעביר לארכיון את 'חיפוש באינטרנט'? ההערכות שלה נשמרות, ולא ייכתבו חדשות." Never offer to delete. | `archive-skill`; back: `restore-skill` |

## A Trainee who left

An update names them → don't record it: say they left on that date and ask "לרשום בכל זאת?". Only after a yes, record it with `--insist` (load `record`).

## Proposing a new Skill

A yes to the logging route's `(הצעה) "<theme>" חוזר…` line confirms it: `update-cycle` `add-skill`, "עודכן: …", then draft Playbook items (read [playbook.md](playbook.md)). Each theme once per conversation; never add a Skill without a yes.
