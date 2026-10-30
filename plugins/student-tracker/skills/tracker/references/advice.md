# Advice and next-Talk questions

**Advice** is your suggestion for helping one Trainee, built from the Playbook and that Trainee's Evidence. It is always marked "(הצעה)" and never stored: it becomes a record only when the Commander accepts it as an improve/keep item or a Follow-up. The **Playbook** is the base items that ship with the plugin plus the Commander's own; each item is a `sign` (what weakness or strength in a Skill looks like), a `tip` (for the Commander), an `exercise` (for the Trainee) or a `talk-question`, tagged to Skills or "general", optionally to a level band.

## "איך לעזור לנועה בדיבאג?"

1. **Who and what.** The Trainee by name, as in [log.md](log.md) (ask when the name is unknown or shared). The focus, if they named one, as Skill ids from `readCycle` → `skills` ("דיבאג" → `impl.debugging`; a name in several Stages, like "סדר וארגון", → the ids their Evidence is about, or all of them). A focus that no Skill names ("ניהול זמן") is no Skill id: go on without one and keep their words as the theme. "איך לעזור לנועה?" names no focus.
2. **Read.** `readTrainee(tid, since: 6 weeks back)` and `readPlaybook(tid, skills: <the focus ids>)`. With no focus, `readPlaybook` picks the targets itself: the declining (↓) Skills, then the lowest-rated. A Trainee with nothing rated and no focus gets only the general items: build from their Evidence.
3. **Choose 2–3 suggestions**, never more:
   - From the targets' items (already fitted to the Rating band; the Commander's own come first, prefer them) and the general items.
   - **Skip** an item the Evidence shows was already tried without effect ("ישבה עם דני ולא עזר", "ניסינו זמן קצוב, לא עבד"), and one an active improve/keep item or open Follow-up on the card already covers.
   - Use the `sign` items to read the Evidence, not as suggestions themselves.
4. **Rewrite each to this Trainee**: what to do, grounded in what the Evidence says about them, and cite it (`— <Evidence kind> <DD/MM>`, as in [assess.md](assess.md)). No item text pasted bare, nothing the Evidence doesn't support, and nothing of a sensitive record beyond "מצב אישי" (the Commander may be reading in front of others).
5. **Record nothing.**

The reply is the brief's "מיקוד (הצעה)" block ([brief.md](brief.md)) on its own, each point with the Evidence it rests on:

```
נועה — יכולות דיבאג 2 (↓)

מיקוד (הצעה)
1. דיבאג — לשבת לידה על הבאג הבא ולשאול רק "מה ציפית ומה קרה בפועל?" — נתקעה שעה בלי לבודד את הבעיה — שיחה 28/10
2. דיבאג — תרגיל קצר: באג שתול שמוצאים רק עם הדפסות, עם רישום של כל השערה — בתרץ האחרון לא הדפיסה כלום — סקד 22/10
3. לפתוח במה שהצליח — מצאה לבד את הבאג בלולאה — שיחה 21/10

לשמור אחת מהן כנקודה לשיפור או לשיחה הבאה?
```

The heading line names each target Skill with its Rating, and its arrow only when it has one ("(לא מדורג)" when unrated). Then `מיקוד (הצעה)` and the 2–3 suggestions, numbered `1.`–`3.`, each `<Skill or theme> — <what to do> — <what in the Evidence it rests on> — <Evidence kind> <DD/MM>`.

## When the Commander accepts one

- **As an improve item** ("כן, תוסיף את השנייה לשיפור"): their message is the Entry, by [log.md](log.md): one `improve-keep` Evidence about the Trainee with the whole message as its excerpt, and an `improve` item `by: agent` taken from it (`from: #1`), its text the suggestion in a few display-safe words. When their message carries its own wording ("תוסיף לה לשיפור: לכתוב מה ניסתה לפני ששואלת"), the item is theirs, word-for-word, as [state.md](state.md) says.
- **As a Follow-up** ("תוסיף לשיחה הבאה לבדוק שהיא כותבת לוג"): a Follow-up is the Commander's words, so their message is the Entry and the Follow-up its words, by [log.md](log.md). When they only point at a suggestion ("כן, את הראשונה לשיחה הבאה"), ask once: `מה לרשום לשיחה הבאה? (במילים שלך, למשל: "<the suggestion, short>")` and record their answer the same way.
- The same holds for a next-Talk question they adopt from the dashboard.
- "אל תציע לי את זה יותר" on a suggestion: hide its base item, or retire their own, by [playbook.md](playbook.md) (confirmed first).
- Anything else, or no answer: nothing is recorded.

A target Skill the Commander added with no items: offer draft items for it by [playbook.md](playbook.md), after the suggestions.

## Next-Talk questions (`nextTalk`)

The card keeps two or three questions the Commander could ask the Trainee in their next Talk; the dashboard shows them under "לשיחה הבאה", marked הצעה. They go stale whenever the Trainee's records change, so you rewrite them in the same call:

- **With every Entry**, for each Trainee it has Evidence about: a `nextTalk` change in the `recordEntry` call, next to the Snapshot ([state.md](state.md)).
- **With a re-rate** or an accepted proposal: `nextTalk` in the `recordAssessments` call.
- **With a brief** ([brief.md](brief.md)): refreshed and shown as its "שאלות פתיחה", stored on their own with `recordNextTalk`.

Writing them:

- Two or three short Hebrew questions, addressed to the Trainee ("איך מצאת את הבאג הפעם?"), from their card, the 6 weeks of `readTrainee` you already read, and this Entry: their lowest or declining Skills, what just happened, a goal they set. A `talk-question` item from `readPlaybook` can be one, rewritten to them, when you have read it in this conversation.
- Not an open Follow-up again (the dashboard shows those right above), not a question the Trainee already answered in this Entry.
- Display-safe: no word of a sensitive part, ever ("איך את מרגישה השבוע?" at most). Storage refuses a question that repeats one.
- Not in the reply (the confirmation line carries no Advice), except in a brief, which shows the ones it stored.
