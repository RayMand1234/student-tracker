**Load:** read

# Advice and next-Talk questions

## "איך לעזור לנועה בדיבאג?"

1. Trainee by name (ask if unknown or shared). Focus, if named → Skill ids from `read-cycle` → `skills`; a name in several Stages ("סדר וארגון") → the ids their Evidence is about, or all; no Skill matches ("ניהול זמן") → keep their words as the theme.
2. `read-trainee <tid> --since <6 weeks back>` and `read-playbook <tid> <focus ids>`. Nothing rated and no focus → only general items: build from the Evidence.
3. Choose 2–3, never more, from target items (Commander's own preferred) and general items. Skip what the Evidence shows was tried without effect, or an active item or open Follow-up covers. `sign` items only help read the Evidence.
4. Rewrite each to this Trainee, grounded in their Evidence. No bare item text, nothing unsupported, nothing sensitive beyond "מצב אישי" (others may be reading). Record nothing.

```
נועה — יכולות דיבאג 2 (↓)

מיקוד (הצעה)
1. דיבאג — לשבת לידה על הבאג הבא ולשאול רק "מה ציפית ומה קרה בפועל?" — נתקעה שעה בלי לבודד את הבעיה — שיחה 28/10
2. דיבאג — תרגיל קצר: באג שתול שמוצאים רק עם הדפסות, עם רישום של כל השערה — בתרץ האחרון לא הדפיסה כלום — סקד 22/10
3. לפתוח במה שהצליח — מצאה לבד את הבאג בלולאה — שיחה 21/10

לשמור אחת מהן כנקודה לשיפור או לשיחה הבאה?
```

Heading: each target Skill with its Rating, arrow only if it has one, "(לא מדורג)" if unrated. Each point: `<Skill or theme> — <what to do> — <what in the Evidence it rests on> — <Evidence kind> <DD/MM>`.

A target Skill the Commander added with no items: after the suggestions, offer draft items: read [playbook.md](playbook.md) "A Skill the Commander added" only then.

## When the Commander accepts one

Their message is an Entry: read [log.md](log.md) only now, and record it (load `record`).

- **Improve item** ("כן, תוסיף את השנייה לשיפור"): one `improve-keep` Evidence, the whole message as excerpt, plus an `improve` item `by: agent`, `from: #1`, text the suggestion in a few display-safe words. If the message has its own wording ("תוסיף לה לשיפור: לכתוב מה ניסתה לפני ששואלת"), the item is `by: commander`, their words word-for-word.
- **Follow-up** ("תוסיף לשיחה הבאה לבדוק שהיא כותבת לוג"): the Follow-up is their words. If they only point ("כן, את הראשונה לשיחה הבאה"), ask once: `מה לרשום לשיחה הבאה? (במילים שלך, למשל: "<the suggestion, short>")`, then record the answer the same way.
- Same for a next-Talk question adopted from the dashboard.
- "אל תציע לי את זה יותר": hide its base item or retire their own, confirmed first: read [playbook.md](playbook.md) only then (load `playbook`).
- Anything else or no answer: record nothing.

## Next-Talk questions (`nextTalk`)

2–3 card questions for the next Talk (dashboard "לשיחה הבאה"). Rewrite them:

- Every Entry: a `next-talk` block in `record-entry` per Trainee with Evidence in it, beside the Snapshot.
- Re-rate or accepted proposal: a `next-talk` block in `record-assessments`.
- Brief: refreshed, shown as "שאלות פתיחה", stored with `record-next-talk`.
- `flip-sensitive` lists them in `repeats`: fresh ones with `record-next-talk`.
- Not on the Commander's Status change, a roster change or other flips.

Writing them:
- Short Hebrew, to the Trainee ("איך מצאת את הבאג הפעם?"): lowest or declining Skills, what just happened, a goal they set. A `talk-question` item read in this conversation may be one, rewritten.
- Not an open Follow-up, not one answered in this Entry.
- Display-safe: no word of a sensitive part ("איך את מרגישה השבוע?" at most).
- Never in the reply, except a brief's.
