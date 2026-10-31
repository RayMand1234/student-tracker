# Store: recording

## `recordEntry({text, evidence, assessments, items, changes, insist?})`

→ `{entry, evidence, sensitive, followups, assessments, items, changes}` (id lists). Keeps `text` word-for-word as an Entry, writes each record under its Trainee, updates touched cards (a Talk moves `lastTalk` forward only, even a wholly sensitive one; opened Follow-ups join `followups`, closed ones leave).

**Evidence**: `trainee`, `kind`, `date`, `excerpt` (copied word-for-word from `text`), kind fields (default if omitted), optional `closes: [open Follow-up ids of that Trainee]`, `followups: [text…]` (word-for-word), `sensitive: [part…]`.

| Kind | Fields |
|---|---|
| `talk` | `topics: []` |
| `test` | `subject: null`, `test: null`, `unlisted: false`, `score: null`, `self: null` |
| `code-review` | `subject: null`, `test: null`, `unlisted: false` |
| `project-observation` | `project: null` (preset Project id; `team` is set by the store) |
| `clarification` | `clarifies` (required: a live Evidence id of the same Trainee) |
| `self-assessment`, `improve-keep`, `goal`, `background`, `evaluation-event`, `note` | none |

`test` must be a canonical Test name in the preset (its `subject` as the preset gives), unless `unlisted: true` (never on a canonical name). `project` must be a preset Project.

**Sensitive part**: `category`, `excerpt` (the sensitive sentence(s), word-for-word, one stretch of `text`), optional `kind` (`note` default, or `background`, `goal`, `self-assessment`, `improve-keep`, `evaluation-event`), `closes`, `followups`. The public `excerpt` replaces each part with "[פרט אישי — בתיק]", the text around it copied in order; a wholly sensitive Evidence keeps just the marker. Marker ⇔ sensitive part. No public excerpt or public Follow-up may reach into a sensitive stretch, even a few words (words also standing elsewhere in `text` are fine).

**Assessment** (optional): `trainee`, `skill` (non-archived Skill id), `score` (1–5 whole), `author`, `reason` (display-safe), `evidence: [refs]` — ref = `#<n>` (this Entry's record `<eid>-<n>`, an Evidence or sensitive part of that Trainee) or a stored live Evidence id of that Trainee. A `trainee` Assessment cites a `self-assessment`. One per author per Trainee per Skill.

**Improve/keep item** (optional): `trainee`, `kind` (`improve` שיפור / `keep` שימור), `text`, `by` (`commander`: word-for-word from `text`, not reaching into a sensitive part unless taken from one; `agent`: your words, display-safe), `from` (ref to its origin Evidence).

**Changes** (optional), about a Trainee with Evidence in this Entry, ≤1 per type per Trainee (one `retired` per item):
- `{type: "status", trainee, to, reason, evidence}`: the agent's Status, without asking. Refused when the card's Status is `by: commander`: propose instead.
- `{type: "stage", trainee, to, reason?, evidence}`: only after the Commander confirmed a stage they gave; cites an `evaluation-event` of this Entry. `to: null` leaves the process.
- `{type: "snapshot", trainee, text}`: short, display-safe.
- `{type: "retired", trainee, item, by, reason, evidence}`: an active item leaves the card. The agent retires only `agent` items.
- `{type: "nextTalk", trainee, questions}`: 2–3, distinct, non-empty, display-safe.

Status/stage must differ from now; Status, stage and retirement need `evidence` (live refs of that Trainee); Status and retirement need a reason.

Ids in order: Evidence `<eid>-1…`, then sensitive parts, then Follow-ups (each Evidence's own, then its parts'), then Assessments, items, changes.

Refused when: no Evidence; a Trainee who left (unless `insist`: the Commander asked anyway); unknown Trainee, kind or field; bad date; any rule above broken; >49 records for one Trainee.

## Outside an Entry

- **`recordAssessments(tid, assessments, insist?, nextTalk?)`** → `{assessments}` (+`changes: [id]`). A re-rate or accepted proposal: Assessments as above minus `trainee`, citing stored Evidence ids only, `entry: null`, dated today. Optional `nextTalk` questions in the same step. Refuses an empty list or a Trainee who left (unless `insist`).
- **`recordNextTalk(tid, questions)`** → `{change, card}`. The brief's next-Talk questions, so the dashboard shows them. Not an Entry: "בטל" doesn't withdraw it.
- **`recordSnapshot(tid, text)`** → `{change, card}`. A fresh Snapshot after a sensitive flip left the old one repeating it. Not an Entry.

Both refuse an unknown Trainee, one who left, and text that isn't display-safe.
