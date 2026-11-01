# Glossary

**Trainee (חניך)**
A person in the course whom a Commander personally tracks. Canonical term; "student" is a loose synonym and is not used in the product.

**Commander (מפקד)**
The person who installs the plugin and tracks their own Trainees: a team commander (מפ"צ), an instructor, or both.

**Cycle (מחזור)**
One run of the course, identified by a name or color ("the yellows") and starting on a date that anchors its Schedule. A Commander tracks Trainees within one Cycle.

**Stage (שלב)**
One of four ordered phases a Trainee moves through when solving a problem: למידה ותאוריה → הבנת הבעיה → תכנון הקוד → מימוש בקוד. Each Stage contains its own Skills.

**Skill (מיומנות)**
A specific ability inside a Stage, such as יכולות דיבאג in מימוש בקוד. A Skill belongs to exactly one Stage or to the Interpersonal group; the same name in two Stages is two different Skills.

**Interpersonal group (בין-אישי)**
A set of Skills about working with others (teamwork, communication, accepting criticism, responsibility, helping others). Tracked alongside the Stages but is not itself a Stage.

**Assessment (הערכה)**
One dated judgment of a Trainee on one Skill: a score from 1 to 5, its author (the agent, the Commander, or the Trainee), a reason, and the Evidence it rests on. Never edited; a later judgment is a new Assessment. A Commander override is simply an Assessment authored by the Commander.

**Self-assessment (הערכה עצמית)**
An Assessment authored by the Trainee, taken from their self-assessment form (רמ"ת). Never counts toward a Rating; its gap from the Rating is itself a signal for מודעות עצמית.

**Rating (דירוג)**
A Trainee's current score on one Skill: a whole number 1–5, equal to the latest Assessment that counts, or unrated when there are none. Once the Commander has assessed a Skill, only the Commander's Assessments count for it; the agent's later ones are kept as proposals. One scale serves every Skill: 1 not functioning · 2 struggling, needs close guidance · 3 reasonable, with mistakes · 4 good and independent · 5 excellent, could teach others.

**Trend (מגמה)**
Whether a Rating rose, fell or held compared with four weeks earlier. None when the Skill was unrated then.

**Stale Rating**
A Rating whose latest counting Assessment is more than six weeks old. It keeps its value; it only signals that nobody has looked at that Skill lately.
_Avoid_: using "Rating" for a single past judgment; that is an Assessment.

**Entry (רישום)**
One message the Commander wrote, kept whole and word-for-word. The agent splits an Entry into Evidence items; the Entry stays so the split can be checked or redone.

**Evidence (תיעוד)**
One fact the Commander recorded about one Trainee, cut from an Entry and kept word-for-word: a Talk, a test (תרץ), a code review (סקד), a project observation, a self-assessment form (רמ"ת), improve/keep points, a goal, background, an evaluation-process event, a note, or a clarification. Never edited; a correction is a new clarification linked to the original.

**Retraction (ביטול)**
The Commander withdrawing an Entry recorded by mistake. Everything cut from that Entry stops counting and stops being shown, but nothing is deleted or edited; the Entry and its Evidence stay on record as retracted.
_Avoid_: "delete", "undo" (nothing is removed).

**Hard delete (מחיקה לצמיתות)**
Permanently erasing an Entry and everything cut from it, sensitive records included. Only when the Commander explicitly asks, and only after they confirm; never what "בטל" does. Cannot be undone.
_Avoid_: using it for a Retraction.

**Sensitive Evidence**
Evidence about health, family, distress, finances, romantic relationships, or discipline/legal matters. Kept in full but never shown on the dashboard, where it appears as "[פרט אישי — בתיק]". The agent marks it; the Commander can flip the mark. When only part of a message is sensitive, that **sensitive part** is cut out of its Evidence into its own Sensitive Evidence, and the public Evidence keeps the rest with the marker in its place.

**Follow-up (נקודה פתוחה)**
Something to check or raise with a Trainee later, born from any Evidence, open until a later Evidence closes it.

**Status (סטטוס)**
A Trainee's overall standing: good (on track), watch (keep an eye), or concern (needs action). Proposed by the agent with a reason; the Commander can override.

**Status change**
A record that a Trainee's Status moved (from → to), when, by whom, why, and on what Evidence. Status history is the trail of these.

**Active / Left**
Whether a Trainee is still in the course. A Trainee who left (dismissal, transfer, other) keeps all their records but drops out of team statistics.

**Label (תווית)**
A short distinguishing addition to a Trainee's display name when two Trainees share a first name ("נועה כ." / "נועה ל."). It replaces the bare name everywhere; no other identifying detail is stored.

**Evaluation process (תהליך הערכה)**
An escalating process for a Trainee the Commander feels stuck with, aimed at improvement: רף מקס → רף רמד → רף מפקד היחידה → הדחה. Its stage changes only when the Commander says so.

**Snapshot (תמונת מצב)**
The agent's short summary of where a Trainee stands now. Always an assessment, regenerated as Evidence arrives.

**Subject (מקצוע) / Test (תרץ)**
A Subject is a course unit (תבי, OOP, DB, …). A Test is a named, scored exercise within a Subject, known by a canonical name and its aliases ("FOV" / "פוב").

**Improve/keep item (שיפור / שימור)**
One feedback point for a Trainee: something to improve or to keep doing. The Commander's are word-for-word; the agent's are marked "(הצעה)". Active until retired, when it leaves the Trainee's card but stays in history.

**Project / Project team**
A Project is a multi-week group assignment in the course (Interpreter, Padens, MZ). A Project team is the set of Trainees who worked on one Project together in a Cycle.

**Schedule**
The Cycle's week-by-week plan of which Subjects run when. Lets an ambiguous reference ("תרץ 1") be resolved by its date.

**Talk (שיחה)**
A one-on-one conversation between the Commander and a Trainee, held on a target cadence the Commander sets. A kind of Evidence.

**Next-Talk questions (שאלות לשיחה הבאה)**
Two or three questions the agent suggests the Commander ask a Trainee in their next Talk, marked "הצעה". They are a form of Advice, kept on the Trainee's card so the dashboard can show them, and replaced whenever that Trainee's records change. They are not Follow-ups; a question becomes a Follow-up only when the Commander adopts it.

**Brief (הכנה לשיחה)**
A short reply the Commander reads a minute before a Talk with one Trainee: what changed, what to check, focus points, something to reinforce, opening questions (the same Next-Talk questions the dashboard shows) and personal things worth asking about.

**Team status (מה המצב)**
A reply about the whole team: who needs a Talk, who is declining, weaknesses shared across Trainees, and one suggested action for everyone. The dashboard has no team-wide view; this is it.

**Alert (התראה)**
One line the agent adds to an unrelated reply when something needs the Commander's attention: an overdue Talk, a weakness newly shared by several Trainees, or a pattern repeated 3+ times in one Trainee's records. Each alert at most once a day.

**Archived Cycle (מחזור בארכיון)**
A previous Cycle, kept read-only after the Commander starts a new one. Its artifact still opens, with a banner, and the agent can answer questions about it, but nothing new is recorded in it.

**Dashboard (דשבורד)**
The Cycle's private artifact page. It opens on the Talk circles: one circle per active Trainee, colored from green to red by the days since their last Talk. Clicking a circle opens the Trainee window (a summary), which leads to the Trainee file.

**Trainee file (תיק חניך)**
The full dashboard page for one Trainee: Snapshot, growth and trend charts, improve/keep items, open Follow-ups, every Skill's Rating history and the Evidence timeline. Read-only; changes are made in chat.

**Playbook**
The collection of Playbook items a Commander draws on to help Trainees improve. Made of a shared base that ships with the plugin plus the Commander's own items.

**Playbook item (פריט פלייבוק)**
One piece of Playbook text of one kind: a sign (what weakness or strength in a Skill looks like), a tip (for the Commander), an exercise (for the Trainee), or a Talk question. Tagged to one or more Skills, or "general", and optionally to a level band (low 1–2, mid 3, high 4–5). Its origin is base or Commander. A Commander's items belong to the Commander, not the Cycle, and can be edited or retired; a base item can be hidden by a Commander but not changed.
_Avoid_: "Playbook entry".

**Advice (המלצה)**
The agent's suggestion for helping one Trainee, built from Playbook items and that Trainee's Evidence. Always marked "(הצעה)" and never stored; it becomes a record only when the Commander accepts it as an improve/keep item or a Follow-up.

**Course preset**
The default course structure that ships with the plugin: Subjects in order, Tests with their aliases, Projects, and the Schedule. Each Cycle starts from its own copy, which the Commander can change without touching the shipped default.

**Course family**
The Fullstack course and its variants run by the same unit. The plugin targets any Commander in this family; course structure and test catalog are a default the Commander can override.
