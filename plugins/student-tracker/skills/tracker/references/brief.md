# Pre-Talk brief

"תכין לי שיחה עם נועה", "מה המצב עם נועה", `/student-tracker:brief נועה`: a brief the Commander reads a minute before the Talk. About 15 lines, bullets only.

1. **Who.** The Trainee by name, as in [log.md](log.md) (ask when no name is given, or it is unknown or shared). One who left: say so in one line (`<name> עזב/ה ב-DD/MM.`) and offer recall ([recall.md](recall.md)) instead.
2. **Read** `readTrainee(tid, since: 6 weeks back)`. Widen `since` only when the Commander asks for more ("מתחילת המחזור", "מה היה בספטמבר"). Then `readPlaybook(tid)` for the focus points.
3. **Write the brief** in this layout, sections always in this order, a section with nothing in it left out. Plain lines as shown: no bold, no Markdown headings, and nothing outside the sections (no remarks on how little is on record, no closing advice); a Trainee with little on record simply gets a short brief.

```
נועה — שיחה אחרונה 21/10 (לפני 9 ימים) · במסלול

מה השתנה
• תרץ FOV 28/10: 85. מצאה לבד באג בלולאה
• דיבאג 2→3 (הערכה) · עבודת צוות נשאר 4

לבדוק
• "סיכמנו שתשב עם דני על הדיבאג" (21/10)

מיקוד (הצעה)
1. דיבאג — שתסביר איך מצאה את הבאג
2. זמנים — הגישה באיחור פעמיים

לחזק
• הובילה את החלוקה למשימות בפאדנס

שאלות פתיחה (גם בדשבורד)
• מה עזר לך למצוא את הבאג לבד?
• איך הולך בצוות של פאדנס?

אישי
• לשאול על אמא שלה (סיפרה 25/10)
```

- **Header**: the name, `שיחה אחרונה DD/MM (לפני N ימים)` from the card's `lastTalk` (`טרם שיחה` when none), then the Status in Hebrew (במסלול / במעקב / דורש טיפול; left out when none) and the evaluation stage when the card has one (`· רף מקס`).
- **מה השתנה**: what happened since the last Talk (the Talk day itself excluded; with no Talk yet, the 6 weeks read): one bullet per notable Evidence, short, with its kind and `DD/MM` (Test name and score as recorded), then one bullet for the Ratings: each Skill whose Rating (by the Rating rule in [assess.md](assess.md)) moved since the last Talk as `<Skill> 2→3 (הערכה)` (`(מפקד)` when the Commander's), `—→3` for a first Rating; Skills re-assessed at the same score as `<Skill> נשאר 4`.
- **לבדוק**: every open Follow-up on the card, word-for-word in quotes, with its date; then anything the Commander's Evidence asked to raise in the next Talk ("לשיחה הבאה…", "לשאול אותה על…") that is not already one.
- **מיקוד (הצעה)**: 2–3 numbered focus points, built as Advice ([advice.md](advice.md), steps 3–4: lowest or declining Skills, Commander items first, skip what was tried, grounded in her Evidence), each `<Skill or theme> — <what to do or ask, a few words>`. Nothing is stored.
- **לחזק**: one specific positive thing from the Evidence since the last Talk (or the 6 weeks read), in a few words. Left out when there is none; never invent one.
- **שאלות פתיחה (גם בדשבורד)**: two or three questions to open the Talk with, addressed to the Trainee. Start from the card's `nextTalk` questions and refresh them: keep one that still fits, rewrite one the Evidence has moved past, as [advice.md](advice.md) says under "Next-Talk questions" (display-safe, not an open Follow-up again). Then store them: `recordNextTalk(tid, questions)`, so the dashboard shows exactly these. Show them as stored.
- **אישי**: personal things worth asking about: background, goals, and what the Trainee shared about their life (`sensitive` records included: this chat is the Commander's alone), each as what to ask about, with its date. Left out when there is nothing.

The brief records nothing but the opening questions, so it has no Retraction line and no alert line (the alerts are under "מה המצב").
