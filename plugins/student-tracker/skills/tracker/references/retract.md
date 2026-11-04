**Load:** read, undo

# Retraction

Act without asking, except where below says to.

## 1. Which Entry

Bare "בטל" right after (record nothing unless retracting):
- an Entry you recorded: its `entry` id.
- another write (re-rate, accepted proposal, sensitive flip): in one line, "בטל" withdraws only Entries; name what undoes it (a new Commander Rating; "זה רגיש" / "זה לא רגיש") and ask if they meant their last update, quoting its opening words.
- a Retraction: `אי אפשר לשחזר ביטול — אפשר לכתוב את העדכון מחדש.`
- nothing this conversation: `retract-entry` with no id; name the Entry in the reply.

A named Entry: match `read-trainee` Entries by `at` or Evidence `date`. Exactly one → it; else ask which, one line each (`DD/MM HH:MM`, opening words), recording nothing.

## 2. Retract

Note the touched cards (from `start`'s team); `retract-entry [<entry id>]` (already retracted → `הרישום הזה כבר בוטל.`). Then `read-trainee <tid> --retracted` per result `trainees` (what was withdrawn) and `read-team` (the new cards), all together.

## 3. Reply

```
בוטל הרישום מ-30/10 09:15: "דיברתי היום עם נועה, היא נתקעת…"
נועה — שיחה (30/10). נקודה פתוחה: "סיכמנו שתשב עם דני על זה". [פרט אישי — בתיק].
  יכולות דיבאג 3→2
דני — הערה (30/10). נפתחה שוב: "לבדוק שסיים את התרץ".
  עבודת צוות 4→—
הרישום נשמר כמבוטל: לא נספר ולא מוצג.
```

- Line 1: `DD/MM HH:MM` of its `at`; ~8 opening words + "…" from a public excerpt, never a sensitive part.
- Per Trainee: kinds (שיחה, תרץ, סקד, תצפית <Project>, רמ"ת, שיפור/שימור, הערה, תיקון) and dates, Follow-ups word-for-word, "נפתחה שוב: …" for one it had closed. A sensitive part: "[פרט אישי — בתיק]"; never a word of it or a sensitive Follow-up.
- Under it, per Skill whose Rating changed, old card → new (`—` unrated; Rating = last `commander` entry of card `skills.a` dated ≤ today, else the last). Then a Status or stage that went back (`סטטוס: דורש טיפול → במעקב`, `תהליך הערכה: רף מקס → —`) and items that left or came back.

## Hard delete

Only on an explicit "תמחק לגמרי", "מחיקה לצמיתות", "תמחק מהמערכת", never on your suggestion.

1. Find the Entry as in step 1, retracted ones included.
2. Confirm, recording nothing:
   `למחוק לצמיתות את הרישום מ-30/10 09:15 ("דיברתי היום עם נועה…") וכל מה שנגזר ממנו (נועה: שיחה והערכה; דני: הערה)? אי אפשר לשחזר. (כן / לא)`
3. Clear yes in their next message: `hard-delete <entry id>`, reply `נמחק לצמיתות: הרישום מ-30/10 09:15.` Anything else: `לא נמחק.`
