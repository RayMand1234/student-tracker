**Load:** undo

# Sensitive flip

Act on the Commander's word without asking again: "זה לא רגיש" unmarks a sensitive part; "זה רגיש", "תסתיר את זה", "זה אישי" marks an Evidence.

1. **Find it**: usually what the last reply recorded or marked; else in `readTrainee` (load `read`): unmark → a `sensitive` with `record: "evidence"`; mark → an `evidence`. Several fit → ask which in one line, quoting nothing sensitive.
2. **Category** (marking): the Commander's, else the fitting one, else `other`. Never ask.
3. `flipSensitive(id, category?)`.
4. **`repeats`** (marking), replace now (load `record`): questions → 2–3 fresh display-safe ones, `recordNextTalk`; Snapshot → 1–2 short Hebrew sentences on where they stand ("מצב אישי" at most), `recordSnapshot`. Anything else (Status or leave reason, your item): replace it with the next update about this Trainee; say so.
5. **Reply**, one line:
   - unmarked: `הסימון הוסר — הפרט יוצג בדשבורד.`
   - marked: `סומן כרגיש (<בריאות / משפחה / מצוקה / כספים / זוגיות / משמעת / אחר>) — לא יוצג בדשבורד.`, plus, if `repeats` listed more than the questions and Snapshot: ` <סיבת הסטטוס / סיבת העזיבה / הנקודה> עדיין מזכיר/ה את זה בדשבורד, עד העדכון הבא.`, quoting nothing of it.

Marking moves a whole Evidence: to hide one sentence of it, mark it anyway and say so.
