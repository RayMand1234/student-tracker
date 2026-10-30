# Flipping the sensitive mark

The Commander decides what is sensitive. "זה לא רגיש" unmarks a sensitive part; "זה רגיש", "תסתיר את זה", "זה אישי" marks an Evidence as sensitive. Act on their word without asking again.

1. **Find the record.** Usually it is what the last reply recorded or marked (from this conversation). Otherwise `readTrainee` for the Trainee and match what the Commander points at: "זה לא רגיש" → one of their `sensitive` records with `record: "evidence"`; "זה רגיש" → one of their `evidence`. If two or more fit, ask which one in one short line, quoting nothing sensitive.
2. **Category.** Marking needs one (`health`, `family`, `distress`, `finances`, `romance`, `discipline`, as in [log.md](log.md)). Take it from what the Commander said, or the one that fits what the Evidence says; when none fits, `other`. Never ask: the Commander's word is enough.
3. **`flipSensitive(id, category?)`.** The Follow-ups the Evidence opened move with it.
4. **What still repeats it.** Marking returns `repeats` when the card still shows words of what just became sensitive. Next-Talk questions among them: write two or three fresh, display-safe ones now with `recordNextTalk` ([advice.md](advice.md)). Anything else it lists (the Snapshot, a Status or leave reason, one of your items) stays until it is replaced: write a display-safe one with the next update about this Trainee (a fresh Snapshot, by [state.md](state.md)), and say so in the reply.
5. **Reply** in one line:
   - unmarked: `הסימון הוסר — הפרט יוצג בדשבורד.`
   - marked: `סומן כרגיש (<category in Hebrew; other = אחר>) — לא יוצג בדשבורד.`, plus, when `repeats` listed more than the questions: ` <what, in Hebrew: תמונת המצב / סיבת הסטטוס / סיבת העזיבה / הנקודה> עדיין מזכיר/ה את זה בדשבורד, עד העדכון הבא.`, quoting nothing of it.

A public Evidence a sensitive part was cut from keeps its "[פרט אישי — בתיק]" when the part is unmarked; the part itself shows as its own record. Marking moves a whole Evidence: to hide only one sentence of a public Evidence, mark it anyway and say so.
