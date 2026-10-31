# Local backend: recording

| Operation | Command |
|---|---|
| `recordEntry` | `record-entry` (+`--insist`), payload below |
| `recordAssessments` | `record-assessments` (+`--insist`): `--- assessment` blocks of one Trainee citing stored ids, then optionally one `--- next-talk` block |
| `recordNextTalk` | `record-next-talk`: one `--- next-talk <tid>` block |
| `recordSnapshot` | `record-snapshot`: one `--- snapshot <tid>` block |

`record-entry` payload, in order:
- `--- entry`, then the message exactly as written.
- Per Evidence: `--- evidence <tid> <kind> <YYYY-MM-DD>`, then `+<field>: <value>` lines (lists comma-separated: `+topics: a, b`, `+closes: <id>, <id>`; `+unlisted: true`; `+score: 85`), then the excerpt.
  - Each Follow-up it opens: `--- followup`, then its text.
  - Each sensitive part: `--- sensitive <category>`, optional `+kind:` / `+closes:`, then the sentence; its Follow-ups follow as `--- followup`.
- After all Evidence, any of:
  - `--- assessment <tid> <skill id> <score> <author>`, `+evidence: <refs>` (`#<n>` or stored ids), then the reason.
  - `--- item <tid> <improve|keep> <agent|commander>`, `+from: <ref>`, then the text.
  - `--- status <tid> <good|watch|concern>`, `+evidence: <refs>`, then the reason.
  - `--- stage <tid>`, `+to: <stage>` (`none` leaves), `+evidence: <refs>`, then the reason if any.
  - `--- snapshot <tid>`, then the text.
  - `--- retire <tid> <item id> <agent|commander>`, `+evidence: <refs>`, then the reason.
  - `--- next-talk <tid>`, then 2–3 questions, one per line.

```
student-tracker-store --data "<plugin data dir>" record-entry <<'ENTRY'
--- entry
דיברתי עם נועה, היא מצאה לבד את הבאג. ההורים שלה מתגרשים. לבדוק איך היא מסתדרת. העבודת צוות שלה זה 4
דני קיבל 85 בפוב.
--- evidence t-ab12cd talk 2026-10-30
+topics: דיבאג
דיברתי עם נועה, היא מצאה לבד את הבאג. [פרט אישי — בתיק]
--- sensitive family
ההורים שלה מתגרשים. לבדוק איך היא מסתדרת.
--- followup
לבדוק איך היא מסתדרת.
--- evidence t-ab12cd note 2026-10-30
העבודת צוות שלה זה 4
--- evidence t-ef34gh test 2026-10-30
+subject: tabi
+test: FOV
+score: 85
דני קיבל 85 בפוב.
--- assessment t-ab12cd impl.debugging 3 agent
+evidence: #1, e-20261021-1010-k2-1
מצאה לבד את הבאג, אחרי שבוע שעבר נתקעה
--- assessment t-ab12cd inter.teamwork 4 commander
+evidence: #2
המפקד: 4
--- snapshot t-ab12cd
מתקדמת בדיבאג עצמאי.
--- next-talk t-ab12cd
מה עזר לך למצוא את הבאג לבד?
איך הולך בצוות?
ENTRY
```

Commander item + agent Status, and a confirmed stage, look like:

```
--- item t-ef34gh improve commander
+from: #1
להגיש בזמן
--- status t-ef34gh watch
+evidence: #1
לא הגיש שבוע שני ברצף
--- stage t-ef34gh
+to: רף מקס
+evidence: #2
```
