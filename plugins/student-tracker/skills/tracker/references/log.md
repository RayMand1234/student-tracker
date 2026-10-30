# Logging an update

The Commander wrote something about one or more Trainees. Keep it, cut it into Evidence, confirm in one short reply. No confirmation step first when the message clearly concerns known Trainees.

## Rule one: the Commander's words are kept word-for-word

- The whole message is the Entry's `text`, exactly as written: no rewording, shortening or typo fixes.
- Each Evidence `excerpt`, and each Follow-up's text, is copied character-for-character out of that text; the one exception is "[פרט אישי — בתיק]" standing where a sensitive part was cut out (below). `recordEntry` refuses anything else.
- Never invent a score, rating or conclusion the text does not state. A short note with no context is recorded as it is; you may ask about it, never interpret it.

## Before recording anything: ask instead

Ask one short Hebrew question and record **nothing** (not even the parts you understood) when:

- **A name matches no Trainee** on the team ("דיברתי עם יואב" when there is no יואב). Never create a Trainee on your own; you may offer to add one, which is a confirmed roster change ([roster.md](roster.md)).
- **A first name is shared** by two Trainees ("נועה" when there are "נועה כ." and "נועה ל."): ask which one.
- **The Trainee left** (their card has `active: false`): say when they left and ask "לרשום בכל זאת?". After a yes, record with `insist`.
- **The text might be a question rather than an update** ("נועה עברה את פוב?", "דני דיבר איתי?"). Ask whether to record it.
- **A Test reference stays ambiguous** after the Schedule (below).
- **The Commander gives an evaluation-process stage** other than the Trainee's current one ("נועה עלתה לרף מקס"): confirm the stage change first, by [state.md](state.md).

After the Commander answers, record the original message as the Entry (word-for-word, as first written) and add their answer only if it is itself an update.

## Steps

1. **Find the Trainees.** Match names against the cards from `readTeam`. A mention of another Trainee creates Evidence for them only when the text says something about them ("סיכמנו שתשב עם דני" says nothing about דני; "דני עזר לה מאוד" does).
2. **Cut Evidence.** One Evidence = one Trainee and one kind. Its `excerpt` is the part of the message about that Trainee for that kind (the whole message if all of it is).
   - Several Trainees in one message → one Evidence per Trainee, each with its own excerpt.
   - A sentence about the whole team or several Trainees ("כל הצוות היה מעולה בפאדנס") → one Evidence per Trainee it covers, each with that same sentence as its excerpt.
   - Several Tests or kinds about one Trainee → one Evidence each.
3. **Classify** each Evidence into one kind and fill its fields (table below).
4. **Date** each Evidence: the day the thing happened, `YYYY-MM-DD`. Not stated = today. Run `date '+%F %A'` for today and its weekday, then resolve "אתמול", "שלשום", "ביום שני", "בשבוע שעבר ביום ג׳" to the actual date: the most recent such day, never in the future ("ביום שני" said on a Monday means today).
5. **Sensitive details.** Cut them out (below).
6. **Follow-ups.** Open and close them (below).
7. **Assess.** Write Assessments on the Skills the Evidence speaks to, by [assess.md](assess.md): the Commander's own Assessments ("הדיבאג של נועה זה 4"), self-assessment forms and corrections included.
8. **Trainee state.** By [state.md](state.md): the improve/keep items the message gives (and any of yours), items it retires, a Status change if one is due, a stage change the Commander confirmed, and a fresh Snapshot for each Trainee it is about. By [advice.md](advice.md): fresh next-Talk questions for each Trainee it is about.
9. **Record.** One `recordEntry` call with the full text, all its Evidence, its Assessments, items and changes (next-Talk questions included). On a refusal, fix what it names and call again; ask the Commander only when the fix needs their word.
10. **Reply** (format below). Don't repeat the Commander's message back.
11. **A recurring theme with no Skill.** If this Evidence is about a way of working that no Skill in `readCycle` → `skills` names (time management, asking for help, presenting…), and the same theme shows up in 3 or more Evidence (this one included) in that Trainee's records (`readTrainee`, 6 weeks back) or across Trainees you read in this conversation, add the proposal line from [roster.md](roster.md) to the reply. A Skill only covers a theme when it names that ability itself: one you would stretch to fit ("ניהול זמן" under "סדר וארגון") does not, though you may still assess it. Never add the Skill before a yes.

## Kinds

| Kind | When | Fields |
|---|---|---|
| `talk` | A one-on-one conversation the Commander had with the Trainee ("דיברתי עם", "שיחה עם", "ישבתי עם") | `topics`: a few short Hebrew topic words |
| `test` | A Test (תרץ) result or how it went | `subject`, `test`, `score`, `self`, `unlisted` (below) |
| `code-review` | A code review (סקד) or going over a Test's review (סורסים) | `test` when it names one (same rules), `subject` |
| `project-observation` | How the Trainee worked in a Project (Interpreter, Padens, MZ) | `project`: the preset Project id (the Trainee's Project team is linked by storage) |
| `self-assessment` | What the Trainee wrote in their self-assessment form (רמ"ת) | — (a per-Test self verdict goes on that Test's `test` Evidence as `self`) |
| `improve-keep` | Feedback points to improve or keep (שיפור / שימור) | — (each point also becomes an improve/keep item: [state.md](state.md)) |
| `goal` | An aspiration ("מעוניינת בפיקוד") | — |
| `background` | Prior experience, where they came from | — |
| `evaluation-event` | The evaluation process (רף מקס, רף רמד, רף מפקד היחידה, הדחה): entering, moving a stage, a talk within it, leaving | — |
| `clarification` | A correction or added detail about something already recorded | `clarifies`: the id of the Evidence it corrects |
| `note` | Anything else about the Trainee | — |

### Tests: match the Cycle's Course preset

`readCycle` returns the Cycle's Course preset: Subjects, Tests (canonical `name`, `aliases`, `number`, `subject`), Projects and a 21-week `schedule`.

- **By name.** "פוב", "fov", "FOV" → the Test whose name or alias matches (ignore case and spacing). Record `test` = its canonical `name` and `subject` = its Subject id.
- **By number** ("תרץ 1", "תרץ 2 באופ"). If the Subject is named, take that Subject's Test with that `number`. If not, find the Cycle week of the Evidence date: week = whole weeks from the Cycle's start date (`cycle.start` from `readCycle`) to that date, plus 1. Take the Subjects that week's `schedule` entry lists; if exactly one of them has a Test with that number, use it. Otherwise ask ("תרץ 1 של תבי (BaseCalculator) או של OOP (City)?").
- **Unknown Test** (no name or alias matches): record it anyway, `test` = the name exactly as written, `unlisted: true`. In the reply ask once: "<name> לא בקטלוג התרצים — להוסיף אותו? (באיזה מקצוע?)". Only after a yes, `updateCycle` with `addTest` (`name`, `subject` id, `number` if known, `aliases` if the Commander gave any). Never add it on your own.
- **Score** only when the Commander gave a number. "עבר", "נכשל", "היה טוב" are not scores: keep them in the excerpt, leave `score` out.
- **`self`**: the Trainee's own verdict on that Test ("לדעתה לא עברה", from a רמ"ת or a Talk), in short Hebrew words as written ("לא עברה").

## Follow-ups

A Follow-up is something to check or raise with the Trainee later: "סיכמנו ש…", "לבדוק ש…", "לשיחה הבאה: …", a promise or task with a later check.

- **Open** one on the Evidence it came from: its text is the exact words from the message ("סיכמנו שתשב עם דני על זה"). Any kind of Evidence can open one.
- **Close** one when the new message shows it happened or was dealt with: list its id in that Trainee's new Evidence `closes`. Open Follow-ups are on each card (`followups`: `id`, `text`, `date`). Close only when the text clearly settles it; when unsure, leave it open.
- A card Follow-up whose text is "[פרט אישי — בתיק]" is sensitive: when the message might settle it, `readTrainee` and read its words in `sensitive` (`record: "followup"`, same id). Close it from the sensitive part when the closing words are sensitive too, otherwise from the public Evidence.

## Sensitive details

The dashboard shows everything but the raw Entries and the sensitive records, and it may be open in front of others. So cut out, as a sensitive part, every sentence that tells something about the Trainee's:

| Category | For example |
|---|---|
| `health` | physical or mental health, illness, medication, an injury, a diagnosis, "לא ישנה בלילות" |
| `family` | parents, siblings, a divorce, a sick or dying relative, trouble at home |
| `distress` | crisis, breakdown, crying, hopelessness, thoughts of quitting life or of self-harm |
| `finances` | money trouble, debts, a second job to support the family |
| `romance` | a partner, a breakup |
| `discipline` | a disciplinary or legal matter: a trial, a police case, a punishment |

The evaluation process (רף מקס …) is not sensitive by default. Course matters (a hard Test, a bug, missing a deadline) are not sensitive. When unsure, mark it: the Commander can unmark it with one word.

- The **sensitive part** is the sentence (or run of sentences) exactly as written, with its `category`. Its `kind` is `note` unless it is plainly `background`, `goal`, `self-assessment`, `improve-keep` or `evaluation-event`.
- The **public Evidence** keeps the rest of its excerpt, with "[פרט אישי — בתיק]" standing where each sensitive part was. Nothing else of the sensitive part may stay in it. If the whole Evidence is sensitive, its excerpt is just "[פרט אישי — בתיק]" (a Talk still counts as a Talk).
- A **Follow-up** whose words come from the sensitive part is opened by the sensitive part, never by the public Evidence. Close one with the sensitive part's `closes` when the closing words are sensitive too.
- **Talk topics** and anything else you write yourself stay display-safe: "משפחה" or "אישי" at most, never the detail.
- **Serious distress** (a crisis, hopelessness, talk of harming themself, not functioning): add a line suggesting a professional, after the Trainee lines: `כדאי לערב גורם מקצועי (קב"ן / ת"ש / מפקד).` If there is any sign of danger to life, say first to act now through the chain of command and the קב"ן, not to wait for the next Talk.

## Corrections

"טעות", "תיקון", "התכוונתי ל…", "זה היה פליים ולא פוב": find the Evidence it corrects (`readTrainee` for that Trainee) and record a `clarification` with `clarifies` = that Evidence's id and the correction's words as excerpt. Never edit or re-record the original. A correction of a sensitive record clarifies its id and is itself cut out as sensitive. When you can't tell which Evidence it corrects, ask.

## Confirmation reply

One line per Trainee saying what was recorded (kind and date, Test and score when given), each followed by its Assessment lines ([assess.md](assess.md)) and its Status, stage and improve/keep lines ([state.md](state.md)), then any professional-help line, then any question (unknown Test, a proposal's "לעדכן?" or "לשנות?", a new-Skill proposal), then the alert line if one is due ([alerts.md](alerts.md)), then the Retraction line, last:

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

- Dates as `DD/MM`. Mention a closed Follow-up as "נסגרה: …".
- For each sensitive part: "[פרט אישי — בתיק] סומן כרגיש (<category in Hebrew: בריאות / משפחה / מצוקה / כספים / זוגיות / משמעת>)", then once per reply "'זה לא רגיש' לביטול הסימון". Never repeat a word of the sensitive part, nor of a Follow-up it opened (write that one as "נקודה פתוחה: [פרט אישי — בתיק]").
- No Advice on the confirmation reply; the proposals "(הצעה) מציע לעדכן …" and "(הצעה) מציע לשנות סטטוס …" and your own improve/keep items are the only suggestions it carries.
- The reply always ends with the line `לביטול: 'בטל'` when something was recorded. A reply that only asks a question records nothing and has no Retraction line.
