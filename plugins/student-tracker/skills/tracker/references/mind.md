**Load:** read, record

# Mind (מוח)

One Hebrew page per Trainee that grows with them: patterns, trajectory, agreements, open questions. It is the Commander's long memory of the Trainee; the card's Snapshot stays the short "now". Stored by `record-mind`, read by `read-mind`; never on the dashboard.

## Updating (after a recorded Entry)

Per Trainee with Evidence in it, `read-mind <tid>` (send it with `record-entry`'s reads; the page doesn't depend on its result), then after `record-entry` succeeded one `record-mind` per Trainee, all together. Not for a refused or unrecorded message, a Status change on its own, or a re-rate.

Edit the page, never start over:
- Keep what still stands. Add what the new Evidence says, dated `DD/MM`, with its kind (שיחה, תרץ, סקד…).
- A repeat of an existing line becomes one counted pattern ("חוזר ב-3 תרצים: 28/10, 4/11, 11/11"), not a second line.
- A new fact against an old line is never overwritten: keep both under `## סתירות ושאלות פתוחות` as `⚠ <מה נאמר ומתי> מול <מה נאמר ומתי> — לברר`. When settled, replace both with the answer.
- Word-for-word facts, no invented conclusions, nothing undated. Unsure → a question, not a claim.
- Over ~25 KB (the store refuses 256 KiB): fold the oldest per-test lines into `מגמה` and patterns. Keep every open question and agreement.

No page yet: build it from this Entry and `read-trainee` (all Evidence, no `--since`) the same way.

## Building pages for existing records (`/student-tracker:mind [<שם>]`)

For Trainees recorded before the Mind existed, or on "תבנה/תרענן את ה-Mind של נועה". No name: every active Trainee with Evidence and no page yet (a page that exists is left alone, a Trainee with no Evidence is skipped). A name: that Trainee's page, rebuilt from the records.

Per Trainee: `read-trainee <tid>` (everything, no `--since`), `read-mind <tid>`, then build the page from all their Evidence, oldest to newest, by the rules above, and `record-mind`. A named Trainee's old page is a source too: keep its agreements and open questions. Work in rounds of 4 Trainees, each round's calls in one message. Reply one line per Trainee: `נועה — נבנה מ-<N> תיעודים`, `דני — קיים, לא שונה`, `אור — אין תיעודים`. Nothing else, no `לביטול`.

## Page

```
# נועה
עודכן 30/10/2026

## תמונה
3–5 שורות: מי היא, איפה היא עומדת, לאן היא הולכת.

## חוזקות
- הובילה את החלוקה למשימות — תצפית Padens 30/10

## דפוסים חוזרים
- נתקעת בלי לבודד את הבעיה — 3 פעמים (21/10, 28/10, 4/11); ניסינו לשבת לידה, עזר חלקית

## מגמה לפי מקצוע
- DB: ירידה אחרי תרץ 1, שיפור בתרץ 2

## אישי ורקע
- אחות לוחמת בת 21, קשר חזק — 6/7
- (רגיש) אבא שלה בבית חולים — 28/10

## הסכמות עם הנקודה
- שיחה כל שבועיים, לא שבועית — 12/7
- תרשום סימון בזמן קריאה, לבדוק אם עושה

## סתירות ושאלות פתוחות
- ⚠ הרמ"ת: DB 2 "לא עובר" (12/7) מול ריצה מלאה אצלי (19/7) — לברר
```

## Using it

- Brief and advice read it with the Evidence; it never replaces the Evidence for a date or a score.
- `(רגיש)` lines are the Commander's alone: usable in the brief's "אישי", never in advice or any text others may read. They follow the same sensitive categories as a sensitive part.
- Never print the page; use it silently.

## After a Retraction or Hard delete

Per touched Trainee, `read-mind`; if a line rests only on the withdrawn Entry, rewrite the page without it and `record-mind`. No Mind page: nothing to do.
