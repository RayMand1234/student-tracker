# Store: core

One store per Cycle. Touch it only through the operations named in these files. A refused write writes nothing and says why: fix the input or ask the Commander, then retry.

## Archived Cycles

The pointer is `{current, archived: [...]}` (newest last). An archived Cycle is read-only: reads take its address as optional `cycle`; any write to it is refused with "המחזור <name> בארכיון — אפשר רק לקרוא ממנו. עדכונים נרשמים במחזור הנוכחי, <current>."

## Records

Change types (`trainees/<tid>/changes/<id>`, `{type, by, at, retracted: false}` plus):
- roster, `by: commander`: `added`/`renamed` `name`; `left` `date`, `how` (dismissal|transfer|other), `reason`; `rejoined`.
- state (from an Entry: also `entry`, `trainee`):
  - `status`: `from`, `to` (`good` במסלול, `watch` במעקב, `concern` דורש טיפול), `reason`, `evidence`; `by` agent (Entry) or commander (`updateTrainee`, no `entry`).
  - `stage`: `from`, `to` (`רף מקס`, `רף רמד`, `רף מפקד היחידה`, `הדחה`, or `null` = out), `reason|null`, `evidence`; `by: commander`.
  - `snapshot`: `text`, `by: agent`.
  - `retired`: `item`, `reason`, `evidence`; `by` agent or commander.
  - `nextTalk`: `questions` (2–3, display-safe), `by: agent`.
  - `snapshot`/`nextTalk` written outside an Entry have `entry: null`, id `c-…`.

Improve/keep item (`trainees/<tid>/items/<id>`): `{entry, trainee, kind: improve|keep, text, by: agent|commander, from: <origin Evidence id>, date: <its date>, at, retracted: false}`. From a sensitive record → stored at `sensitive/<id>` with `record: "item"`. Active until a live `retired` change names it.

Assessment (`trainees/<tid>/assessments/<id>`): `{entry|null, trainee, skill, score 1–5 whole, author: agent|commander|trainee, reason, evidence: [≥1 Evidence id of that Trainee], date, at, retracted: false}`. `date` = latest cited Evidence date (with an Entry) or today (alone).

Card: `{name, active, left, status, evalStage, lastTalk, snapshot, items, followups, nextTalk, skills}`, from live records; "latest" = by `at`, then id. `name` from the latest change with a name; `left` `{date, how, reason}` from the latest `left` unless a later `rejoined`; `active` = no `left`; `status` `{value, by, reason, at}`; `evalStage` latest stage `to`; `snapshot` `{text, at}`; `items` active items `[{id, kind, text, by, date}]`, oldest date first then id; open `followups` `[{id, text, date}]`, oldest first; sensitive ones show text "[פרט אישי — בתיק]"; `nextTalk` `{questions, at}`; `skills` per Skill id `{a: [[date, score, author], …], n}`. Each `null`/`[]`/`{}` when none. Rating, Trend and stale are computed on read, never stored.

Card `skills`: per Skill with ≥1 live agent/commander Assessment, `a` ordered by `date`, `at`, id (`…-10` after `…-9`), dropping every `agent` one after the first `commander` one; `n` = distinct live Evidence (public or sensitive) cited by those in `a`. `trainee` Assessments never join. Skill ids sorted.

## Rules for every write

- Records are never edited: a change is a new record, a `retracted` flip, or a sensitive flip (move, same id). Every read filters `retracted == false` explicitly. A retracted Evidence can't be cited, clarified, flipped, or close a Follow-up.
- **Sensitive** categories: `health`, `family`, `distress`, `finances`, `romance`, `discipline`. A sensitive part is its own record in `sensitive/`; its public Evidence shows "[פרט אישי — בתיק]" in its place. `sensitive/` and `entries/` never reach the dashboard. Text derived from a sensitive record (Assessment reasons, Snapshots, Status/stage/retirement/leave reasons, agent items, Talk topics, next-Talk questions) cites it by id only.
- **Display-safe**: a display text (list above) is refused if it holds any 3 words in a row (or all of it, if shorter), punctuation aside, of a sensitive part of its Entry or of the Trainee's live sensitive Evidence, unless those words also stand outside a sensitive part (elsewhere in the Entry, or in one of the Trainee's public excerpts). Other Trainees' records don't count. Paraphrase isn't caught: writing display-safe is your job.

## Every-run operations

- **`connect`** → `{backend, url, cycle, setup}`, plus `archived: true` if the current Cycle is marked archived (write nothing to it). With no `current`, finds the Commander's non-archived Cycles: one is saved as the pointer; several → ask which. None → "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`". Adds missing earlier Cycles (`meta/cycle.previous` chain) to `archived`, oldest first.
- **`resumePending`** → `{finished: [eids]}`: finishes any Entry, Retraction or hard delete an earlier session left at `writing`.
- **`readCycle`** → `{cycle, skills, preset, commander: {settings, hides}, playbook, teams}` (each team with its `id`).
- **`readTeam`** → every card with its `id`, those who left included (`active: false`). Team views count only active Trainees.
- **`rebuildCard(tid)`** → the card, recomputed from live records. After a version conflict, or when a card looks wrong.
- **`openDashboard`** → shows the Commander the Cycle's dashboard page.
