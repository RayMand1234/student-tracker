# Artifact backend: recording

## `recordEntry`

**Check first**, writing nothing if any fails: every rule in store/record.md, and specifically: a Trainee who left = card has `left` (and no `insist`); preset = `meta/preset`; Skill ids from `meta/skills`, not `archived`; `clarifies` and stored-id refs: `get` it in the Trainee's `evidence/` or in `sensitive/` (`record: "evidence"`, that `trainee`), `retracted` must be `false`; `closes` against the card's `followups`; Status/stage against the card's `status`/`evalStage`; retirements against the card's `items`; each piece of a marked excerpt is found in `text` after the previous piece; each public piece and Follow-up also stands in `text` outside every sensitive stretch; display-safe check on every display text; ≤49 records per Trainee.

1. **Plan.** Pick the Entry id. Number records from 1 in this order, all `{…, at, retracted: false}`:
   - Evidence → `trainees/<tid>/evidence/<eid>-<n>`: `{entry, trainee, kind, date, excerpt, <kind fields with defaults>, closes}`; listed Test's `subject` from the preset; `project-observation` also `team` = the `teams` doc with that `project` whose `members` hold the Trainee, else `null`.
   - Sensitive parts → `sensitive/<eid>-<n>`: `{record: "evidence", entry, trainee, kind (default "note"), category, date: <its Evidence's>, excerpt, in: <Evidence id>, closes}`.
   - Follow-ups (each Evidence's, then its parts') → `trainees/<tid>/followups/<eid>-<n>` `{entry, trainee, text, from, date: <its Evidence's>}`; opened by a sensitive part → `sensitive/<eid>-<n>` with `record: "followup"`.
   - Assessments → `trainees/<tid>/assessments/<eid>-<n>`: `{entry, trainee, skill, score, author, reason, evidence: [#n → <eid>-<n>], date: <latest cited Evidence date>}`.
   - Items → `trainees/<tid>/items/<eid>-<n>`: `{entry, trainee, kind, text, by, from, date: <origin's date>}`; sensitive origin → `sensitive/<eid>-<n>` with `record: "item"`.
   - Changes → `trainees/<tid>/changes/<eid>-<n>`: `{entry, trainee, type, …, by}`: `status` `{from: card status.value, to, by: "agent", reason, evidence}`; `stage` `{from: card evalStage, to, by: "commander", reason|null, evidence}`; `snapshot` `{text, by: "agent"}`; `retired` `{item, by, reason, evidence}`; `nextTalk` `{questions, by: "agent"}`.
   Group by Trainee (a sensitive record goes in its `trainee`'s chunk).
2. **Entry.** Create `entries/<eid>`: `{text, at, status: "writing", trainees, children: [all ids], retracted: false, pending: [{trainee, records: [{collection, doc_id, data}]}]}`. Taken → new `rand2`. Keep the version.
3. **One chunk per Trainee.** `get` the card (version `v`). New: `lastTalk` = latest of card and chunk Talk dates; `followups` = card's minus ids this chunk `closes`, plus new ones `{id, text, date}` (marker text if sensitive), sorted by date then id; `status`, `evalStage`, `snapshot`, `nextTalk` (`{questions, at}`) from this chunk's changes; `items` = card's minus retired, plus new (marker if sensitive), sorted. With Assessments: per Skill touched, `query` `trainees/<tid>/assessments` where `skill == <id>` and `retracted == false`, add the chunk's, rebuild that Skill's entry. One `batch`: a create per record, plus `update` `trainees/<tid>` with the changed card fields and `if_version: v`.
   - Refused (card moved, or a record exists): `get` `entries/<eid>`; gone or `deletion` set → create nothing. Else create each missing record alone ("already exists" is fine), then `rebuildCard(tid)`.
4. **Done.** `update` `entries/<eid>` `{status: "done", pending: {"__delete__": true}}` with its version; on a conflict `get` it: `done` → stop; else redo.

## Outside an Entry

Common: refuse an unknown Trainee or one whose card has `left` (`recordAssessments`: unless `insist`); display-safe check against stored sensitive records only. Ids from Now, not already taken. `get` the card (version `v`), then one `batch`: create the records + `update` `trainees/<tid>` with `if_version: v`. On a conflict nothing was written: start over with the same ids.

- **`recordAssessments`**: check every Assessment rule (refs = stored live Evidence ids of `tid`). Records `trainees/<tid>/assessments/a-…` `{entry: null, trainee, skill, score, author, reason, evidence, date: today, at, retracted: false}`; with `nextTalk`, also `trainees/<tid>/changes/c-…` `{type: "nextTalk", entry: null, trainee, questions, by: "agent", at, retracted: false}`. Card: rebuild each touched Skill's `skills` entry as step 3 (+ `nextTalk: {questions, at}`). Return `{assessments}` (+`changes: [id]`).
- **`recordNextTalk`**: change `c-…` `{type: "nextTalk", entry: null, trainee, questions, by: "agent", at, retracted: false}`; card `{nextTalk: {questions, at}}`. Return `{change, card}`.
- **`recordSnapshot`**: refuse empty text. Change `{type: "snapshot", entry: null, trainee, text, by: "agent", at, retracted: false}`; card `{snapshot: {text, at}}`. Return `{change, card}`.
