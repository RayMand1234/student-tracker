# Retracting an Entry ("בטל")

The Commander withdraws an update recorded by mistake: "בטל", "תבטל", "בטל את מה שכתבתי על דני אתמול". A Retraction keeps everything stored, flagged as retracted: it stops counting (Ratings, last Talk, Follow-ups) and stops showing, on the dashboard and in briefs. Act on their word without asking again, except where this file says to ask.

## 1. Which Entry

- **A bare "בטל" right after you recorded an Entry** in this conversation: that Entry. Pass its id (the `entry` that `recordEntry` returned).
- **A bare "בטל" right after a write that was not an Entry** (a re-rate, an accepted proposal, a sensitive flip): "בטל" withdraws only Entries. Say so in one line, with what does undo it (a new Rating from the Commander; "זה רגיש" / "זה לא רגיש"), and ask whether they meant their last update, quoting its opening words. Record nothing.
- **A bare "בטל" right after a Retraction**: a Retraction can't be undone. Reply `אי אפשר לשחזר ביטול — אפשר לכתוב את העדכון מחדש.` and record nothing.
- **A bare "בטל" with nothing recorded in this conversation**: the last Entry: call `retractEntry` with no id, and name it in the reply so the Commander sees what went.
- **A named earlier Entry** ("בטל את מה שכתבתי על דני אתמול", "תבטל את השיחה עם נועה מה-12/10"): `readTrainee` for that Trainee and match Entries by the day they were written (`at`) or the `date` of their Evidence. Exactly one fits → that one. Several or none → ask which, one line each: date and time (`DD/MM HH:MM`) and its opening words. Record nothing until they answer.

## 2. Retract

Note the touched Trainees' cards first (`readTeam`, from the start of the run), so the reply can show Ratings that moved. Then `retractEntry(eid?)`.
- Refused as already retracted → reply `הרישום הזה כבר בוטל.`
- Then `readTrainee` for each Trainee in the result's `trainees`, with `retracted` true, to see the withdrawn records (those with `entry` = the Entry and `retracted: true`), and `readTeam` for the new cards.

## 3. Reply

```
בוטל הרישום מ-30/10 09:15: "דיברתי היום עם נועה, היא נתקעת…"
נועה — שיחה (30/10). נקודה פתוחה: "סיכמנו שתשב עם דני על זה". [פרט אישי — בתיק].
  יכולות דיבאג 3→2
דני — הערה (30/10). נפתחה שוב: "לבדוק שסיים את התרץ".
  עבודת צוות 4→—
הרישום נשמר כמבוטל: לא נספר ולא מוצג.
```

- First line: the Entry's date and time (`DD/MM HH:MM`, from its `at`) and its opening words, up to about eight, then "…". Take them from a public excerpt, never from a sensitive part: the raw Entry may hold sensitive sentences.
- One line per Trainee: the kinds and dates withdrawn (as the confirmation reply in [log.md](log.md) names them), the Follow-ups withdrawn word-for-word, and "נפתחה שוב: …" for a Follow-up the withdrawn Evidence had closed that is open again. A withdrawn sensitive part is "[פרט אישי — בתיק]"; never repeat a word of it, nor of a sensitive Follow-up.
- Under it, one line per Skill whose Rating changed, by the Rating rule in [assess.md](assess.md), old card to new: `<Skill name> 3→2`, `—` for unrated; then a line for a Status or evaluation-process stage that went back (`סטטוס: דורש טיפול → במעקב`, `תהליך הערכה: רף מקס → —`) and for improve/keep items that left or came back to the card.
- Last line as shown. No "לביטול" line: nothing new was recorded.

## Hard delete

Only when the Commander explicitly asks to erase for good: "תמחק לגמרי", "מחיקה לצמיתות", "תמחק מהמערכת". Never on "בטל", and never on your own suggestion.

1. Find the Entry as in step 1; a retracted one counts (`readTrainee` with `retracted` true).
2. Confirm first, in one message, and record nothing:
   `למחוק לצמיתות את הרישום מ-30/10 09:15 ("דיברתי היום עם נועה…") וכל מה שנגזר ממנו (נועה: שיחה והערכה; דני: הערה)? אי אפשר לשחזר. (כן / לא)`
3. Only on a clear yes in their next message: `hardDelete(eid)`, then reply `נמחק לצמיתות: הרישום מ-30/10 09:15.` Anything else deletes nothing; say `לא נמחק.`
