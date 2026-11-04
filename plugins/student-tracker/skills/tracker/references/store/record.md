# Store: recording

## `record-entry [--insist]`

Keeps the message word-for-word as an Entry, writes each record under its Trainee and updates their cards. → `{entry, evidence, sensitive, followups, assessments, items, changes}` (id lists). `--insist`: the Commander asked to record about a Trainee who left.

Payload, in order:
- `--- entry`, then the message exactly as written.
- Per Evidence: `--- evidence <tid> <kind> <YYYY-MM-DD>`, then `+<field>: <value>` lines, then the excerpt (copied from the message; each sensitive part replaced by "[פרט אישי — בתיק]", a wholly sensitive one just the marker).
  - Fields: `talk` `+topics: a, b`; `test` `+subject:`, `+test:` (canonical preset name), `+score:`, `+self:`, `+unlisted: true`; `code-review` `+subject:`, `+test:`; `project-observation` `+project:` (preset Project id); `clarification` `+clarifies: <Evidence id>`; any kind `+closes: <open Follow-up ids>`.
  - Each Follow-up it opens: `--- followup`, then its words from the message.
  - Each sensitive part: `--- sensitive <category>`, optional `+kind:` (`note` default) / `+closes:`, then its sentence(s); its Follow-ups follow as `--- followup`.
- Then any of, about Trainees with Evidence here (refs: `#<n>` = this Entry's n-th Evidence or sensitive part, counting Evidence first; or a stored Evidence id of that Trainee):
  - `--- assessment <tid> <skill id> <score 1–5> <agent|commander|trainee>`, `+evidence: <refs>`, then the reason.
  - `--- item <tid> <improve|keep> <agent|commander>`, `+from: <ref>`, then the text.
  - `--- status <tid> <good|watch|concern>`, `+evidence: <refs>`, then the reason. Refused when the card's Status is `by: commander`: propose instead.
  - `--- stage <tid>`, `+to: <stage>` (`none` = out of the process), `+evidence: <refs>`, then the reason if any. Only after the Commander confirmed it.
  - `--- snapshot <tid>`, then the text.
  - `--- retire <tid> <item id> <agent|commander>`, `+evidence: <refs>`, then the reason.
  - `--- next-talk <tid>`, then 2–3 questions, one per line.

At most one of each change per Trainee (one `retire` per item), one Assessment per author per Trainee per Skill.

```
student-tracker-store … record-entry <<'ENTRY'
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

## Outside an Entry

- `record-assessments [--insist]` → `{assessments}` (+`changes`): a re-rate or an accepted proposal. `--- assessment` blocks of one Trainee citing stored Evidence ids, then optionally one `--- next-talk <tid>` block.
- `record-next-talk` → `{change, card}`: one `--- next-talk <tid>` block (the brief's questions). Not an Entry: "בטל" doesn't withdraw it.
- `record-snapshot` → `{change, card}`: one `--- snapshot <tid>` block (a fresh Snapshot after a sensitive flip).
