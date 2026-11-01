**Load:** read, record

# Logging an update

Record the message as one Entry cut into Evidence; confirm in one short reply, with no confirmation step first when it clearly concerns known Trainees.

## Word-for-word

- `text` = the whole message exactly as written: no rewording, shortening, typo fixes, or added/dropped quotes, gershayim, hyphens or spaces ("פאדנס" stays "פאדנס").
- Every `excerpt` and Follow-up text: character-for-character from `text` (bar the "[פרט אישי — בתיק]" marker).
- Never invent a score, rating or conclusion. A context-less short note is recorded as is; ask about it, never interpret it.

## Ask first, record nothing

Ask one short Hebrew question, recording **nothing** (not even the clear parts), when:

- A name matches no Trainee ("דיברתי עם יואב"). Never create one; you may offer to (read [roster.md](roster.md) only on a yes).
- A first name is shared ("נועה" with "נועה כ." and "נועה ל."): ask which.
- The Trainee left (`active: false`): say when, ask "לרשום בכל זאת?"; after a yes, record with `insist`.
- A Test reference stays ambiguous (Tests).
- An evaluation stage other than the card's ("נועה עלתה לרף מקס"): confirm first, by state.md.

After the answer, record the original message as the Entry, plus the answer only if it is itself an update.

## Steps

1. **Trainees**: match names to `readTeam` cards; a mentioned one gets Evidence only if the text says something about them ("סיכמנו שתשב עם דני": no; "דני עזר לה מאוד": yes).
2. **Evidence**: one per Trainee per kind (several Tests → one each); `excerpt` = the part about that Trainee for that kind (maybe the whole message). A sentence about several Trainees or the team ("כל הצוות היה מעולה בפאדנס") → that sentence for each Trainee covered.
3. **Kind** and fields.
4. **Date** it happened (`YYYY-MM-DD`, default today). Run `date '+%F %A'`; resolve "אתמול", "שלשום", "ביום שני", "בשבוע שעבר ביום ג׳" to the most recent such day, never future ("ביום שני" on a Monday = today).
5. Cut **sensitive parts**; open/close **Follow-ups**.
6. **Assessments**: read [assess.md](assess.md) only if some Evidence speaks to a Skill (incl. the Commander's own "הדיבאג של נועה זה 4", a רמ"ת, a correction).
7. **State**: read [state.md](state.md); write per it items, retirements, a due Status, a confirmed stage, a Snapshot per Trainee with Evidence. Also per such Trainee a `nextTalk`: short Hebrew questions to them ("איך מצאת את הבאג הפעם?") on weak or declining Skills, what just happened, a goal (or a rewritten `talk-question` from a `readPlaybook` read this conversation); not an open Follow-up or one this Entry answered; personal at most "איך את מרגישה השבוע?"; never in the reply.
8. **One `recordEntry`** with everything. Refused → fix and retry; ask only if the fix needs the Commander's word.
9. **Reply** (below); don't repeat the message back.
10. **A recurring theme with no Skill.** Check every update. First `readTrainee` (6 weeks) for each Trainee with Evidence, unless already read this turn. Then: does the Evidence show a way of working that no Skill in `readCycle` → `skills` names itself (time management, asking for help, presenting…)? A Skill you'd stretch to fit ("ניהול זמן" under "סדר וארגון") does not count, though you may still assess it. If the theme shows up in ≥3 Evidence, this one included (that Trainee's 6 weeks of `readTrainee`, or Trainees read this conversation), add before the Retraction line:
    `(הצעה) "<theme>" חוזר ב-<N> תיעודים ואין לו מיומנות — להוסיף מיומנות "<name>" ל<Stage or group name>? (כן / לא)`
    Never add the Skill before a yes. On a yes, read [roster.md](roster.md) § Proposing a new Skill.

## Kinds

- `talk`: one-on-one ("דיברתי עם", "שיחה עם", "ישבתי עם"); `topics`: a few short Hebrew words.
- `test`: a Test (תרץ) result or how it went; `subject`, `test`, `score`, `self`, `unlisted`.
- `code-review`: סקד, or a Test's review (סורסים); `test` if named, `subject`.
- `project-observation`: work in a Project (Interpreter, Padens, MZ); `project`.
- `self-assessment`: their form (רמ"ת); a per-Test verdict goes in that `test`'s `self`.
- `improve-keep`: שיפור / שימור points.
- `goal` (an aspiration: "מעוניינת בפיקוד"); `background` (prior experience, origin); `note` (anything else).
- `evaluation-event`: רף מקס, רף רמד, רף מפקד היחידה, הדחה: entering, moving, a talk within, leaving.
- `clarification`: a correction or added detail; `clarifies`.

### Tests (preset from `readCycle`)

- **Name** ("פוב", "fov", "FOV"): match name or alias ignoring case and spacing; record canonical `name` and its `subject`.
- **Number** ("תרץ 1", "תרץ 2 באופ"): Subject named → its Test with that `number`. Else week = whole weeks from `cycle.start` to the Evidence date + 1; exactly one Subject in that week's `schedule` with that Test number → it; else ask ("תרץ 1 של תבי (BaseCalculator) או של OOP (City)?").
- **Unknown**: record as written, `unlisted: true`; ask once in the reply "<name> לא בקטלוג התרצים — להוסיף אותו? (באיזה מקצוע?)". Only on a yes: `updateCycle` `addTest` (load `roster`), with `number`/`aliases` if given.
- **`score`** only for a given number ("עבר", "נכשל", "היה טוב" stay in the excerpt). **`self`**: the Trainee's own verdict on that Test, as written ("לא עברה").

## Follow-ups

To check later: "סיכמנו ש…", "לבדוק ש…", "לשיחה הבאה: …", a promise or task.

- **Open** on its Evidence (any kind), text = the exact words ("סיכמנו שתשב עם דני על זה").
- **Close** (card `followups` id in that Trainee's new Evidence `closes`) only when the message clearly settles it.
- A card Follow-up "[פרט אישי — בתיק]" is sensitive: if the message might settle it, read its words (`readTrainee` → `sensitive`, `record: "followup"`, same id).
- Open/close by the sensitive part when the opening/closing words are in it, else by the public Evidence.

## Sensitive parts

Cut out every sentence about the Trainee's:

- `health`: physical or mental health, illness, medication, injury, diagnosis, "לא ישנה בלילות".
- `family`: parents, siblings, divorce, an ill or dying relative, home trouble.
- `distress`: crisis, breakdown, crying, hopelessness, thoughts of quitting life or self-harm.
- `finances`: money trouble, debts, a second job for the family.
- `romance`: partner, breakup.
- `discipline`: disciplinary or legal matters (trial, police case, punishment).

Not by default: the evaluation process, course matters (hard Test, bug, missed deadline). Unsure → mark it.

- A part: the sentence(s) word-for-word, with `category`; `kind` `note` unless plainly `background`, `goal`, `self-assessment`, `improve-keep` or `evaluation-event`.
- Talk topics and your own text: "משפחה" or "אישי" at most.
- **Serious distress** (crisis, hopelessness, talk of self-harm, not functioning): after the Trainee lines, `כדאי לערב גורם מקצועי (קב"ן / ת"ש / מפקד).` Any danger to life: first say to act now via the chain of command and the קב"ן, not wait for the next Talk.

## Corrections

"טעות", "תיקון", "התכוונתי ל…", "זה היה פליים ולא פוב": a `clarification`, `clarifies` = the corrected Evidence (`readTrainee`), excerpt = the correction's words; never edit or re-record the original. A correction of a sensitive record is cut as sensitive too. Unclear which → ask.

## Reply

Order: per Trainee one line (kind, date, Test and score if given), then its Assessment, Status, stage and item lines; professional-help line; any question (unknown Test, a "לעדכן?"/"לשנות?" proposal, new Skill, or else a Playbook offer); alert line; `לביטול: 'בטל'`.

```
נועה — שיחה (30/10). [פרט אישי — בתיק] סומן כרגיש (משפחה) — 'זה לא רגיש' לביטול הסימון. נקודה פתוחה: "סיכמנו שתשב עם דני על זה".
  יכולות דיבאג 2→3 (הערכה): מצאה לבד את הבאג עם הדפסות — שיחה 30/10
דני — תרץ FOV (29/10), ציון 85.
מאיה — תצפית בפרויקט Padens (30/10).
  עבודת צוות —→4 (הערכה): הובילה את החלוקה למשימות — תצפית Padens 30/10
קרוקודיל לא בקטלוג התרצים — להוסיף אותו? (באיזה מקצוע?)
⚠ אור 22 ימים בלי שיחה (אדום) · +2 ב'מה המצב'
לביטול: 'בטל'
```

- Dates `DD/MM`; a closed Follow-up: "נסגרה: …".
- Per sensitive part "[פרט אישי — בתיק] סומן כרגיש (<בריאות / משפחה / מצוקה / כספים / זוגיות / משמעת>)", plus once per reply "'זה לא רגיש' לביטול הסימון". Never a word of the part or of a Follow-up it opened ("נקודה פתוחה: [פרט אישי — בתיק]").
- No Advice: only the proposals, the Playbook offer and your own items.
- Read [playbook.md](playbook.md) § Offering to save only if the update tells of a reusable method that clearly worked and nothing else is asked.
