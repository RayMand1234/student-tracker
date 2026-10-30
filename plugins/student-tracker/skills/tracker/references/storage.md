# Storage interface

All Trainee data for a Cycle lives in one store. Skills touch it **only** through the operations below; how each operation runs depends on the backend. This file is backend-neutral: it says what an operation does, never how a backend does it.

## Choosing the backend

The pointer file `cycles.json` lives in the plugin data dir and holds only store addresses: `{current, archived: [...]}`, plus `backend: "local"` on a test pointer. Read it with the Read tool; a missing file means there is no pointer. Pick the backend from it:

| Pointer | Backend | Mapping file |
|---|---|---|
| `current` is `local:<dir>`, or `backend` is `"local"` | local JSON files, for tests | [storage-local.md](storage-local.md) |
| `current` is a claude.ai artifact address, or there is no pointer | the Cycle's private artifact database | [storage-artifact.md](storage-artifact.md) |

Read the mapping file for the backend before calling any operation.

## Records

Collections, mirrored by every backend:

```
meta/cycle           name, start date, setup (in-progress | done), schema (1), archived
meta/skills          Skill framework: Stages + Interpersonal group, stable Skill ids (e.g. impl.debugging)
meta/preset          this Cycle's Course preset copy
commander/settings   name, role, talk {target, yellow, red}          ┐ Commander scope,
commander/hides      { hidden: [base Playbook item id…] }            │ copied into the
playbook/<id>        the Commander's Playbook items                  ┘ next Cycle
trainees/<tid>       Trainee card (derived; rebuildable from the sources)
trainees/<tid>/evidence|assessments|followups|items|changes/<id>   immutable sources, retracted: false
teams/<id>           Project teams: {project, name, members: [tid…], at}
entries/<eid>        raw Entries, whole and word-for-word; retracted: false | {at}
sensitive/<id>       sensitive Evidence and the Follow-ups it opens (`trainee`, `record: evidence | followup`)
```

Ids: Trainees `t-<rand6>` (never a name); Entries `e-YYYYMMDD-HHMM-<rand2>`; records cut from an Entry `<entryId>-<n>`; standalone re-rate Assessments `a-YYYYMMDD-HHMM-<rand2>`; roster changes `c-YYYYMMDD-HHMM-<rand2>` (the first one is `added`); Project teams `tm-<rand4>`; added Skills `<group id>.c-<rand4>`. Evidence has `date` (the day it happened, `YYYY-MM-DD`); every record has `at` (ISO timestamp with offset).

A roster change, at `trainees/<tid>/changes/<id>`: `{type, by: "commander", at, retracted: false}` plus, by type: `added` and `renamed` carry `name`; `left` carries `date`, `how` (`dismissal`, `transfer` or `other`) and `reason`; `rejoined` carries nothing more.

Trainee card: `name` (from the latest change with a `name`), `active` and `left` (`{date, how, reason}` from the latest `left` change unless a later `rejoined` one follows it; `active` = no `left`), `status`, `evalStage`, `lastTalk`, `snapshot {text, at}`, display-safe `items`, the open `followups` (`[{id, text, date}]`, oldest first; a sensitive one's `text` is "[פרט אישי — בתיק]"), `nextTalk {questions, at}`, and `skills` (per Skill id, `{a: [[date, score, author], …], n}`). Rating, Trend and stale are computed when read, never stored.

Card `skills`, per Skill with at least one non-retracted `agent` or `commander` Assessment: `a` = those Assessments ordered by `date`, then `at`, then id (`…-10` after `…-9`), leaving out every `agent` one that comes after the first `commander` one (kept, but it never counts); `n` = how many distinct non-retracted Evidence (public or sensitive) the Assessments in `a` cite. `trainee` Assessments never join the card. Skill ids sorted.

An Assessment, at `trainees/<tid>/assessments/<id>`: `{entry: <eid> | null, trainee, skill, score, author, reason, evidence: [Evidence ids], date, at, retracted: false}`. `score` is a whole number 1–5; `author` is `agent`, `commander` or `trainee`; `skill` is a Skill id in `meta/skills`; `evidence` holds at least one id of that Trainee's Evidence, public or sensitive. `date` is the latest `date` among the Evidence it cites when written with an Entry, today when written on its own.

## Operations

Every write refuses, writing nothing, when its input is invalid, and says why. Records are never edited: a change is a new record, a flag flip (`retracted`) or a sensitive flip (a move under the same id). Retracted records stay stored but stop counting and showing: every read filters on `retracted == false` explicitly (never on a missing field), and a retracted Evidence cannot be cited, clarified, flipped or close a Follow-up.

**Sensitive.** Categories: `health`, `family`, `distress`, `finances`, `romance`, `discipline`. A sensitive part of an Evidence is its own record in `sensitive/`, and its public Evidence shows the marker "[פרט אישי — בתיק]" in its place. Nothing in `sensitive/` or `entries/` is ever shown on the dashboard; everything else may be, so text derived from a sensitive record (Assessment reasons, Snapshots, Status-change reasons, card copies, Talk topics) cites it by id only.

Write rules every backend keeps: creating a document whose id exists is refused, so a retry can't duplicate; a write to an existing document pins the version last read and is refused if it moved; a batch is 1–50 writes, ≤1 MiB, each document once. A batch with a pinned write is all-or-nothing; a batch without one applies in order and may stop part-way.

**Entry write protocol.** `recordEntry` runs in steps any session can finish:
1. Write the Entry with `status: writing`, its touched Trainees (`trainees`), the ids of every record it will cut (`children`) and the full plan of those records.
2. One chunk per Trainee: that Trainee's new records plus their card, in one version-pinned batch. If the card moved meanwhile, write the records alone and `rebuildCard`.
3. Mark the Entry `done` and drop the plan.
Child ids are `<entryId>-<n>`, fixed in step 1, so redoing a chunk never duplicates a record.

**Retraction protocol.** `retractEntry` (and `hardDelete`) runs the same way, on an Entry that is `done` (one still `writing` is finished first, or a later chunk would bring its records back unflagged):
1. Mark the Entry: `retracted: {at}` and `retraction: writing` (`hardDelete`: `deletion: writing`).
2. One chunk per Trainee in `trainees`: that Trainee's records among `children`, wherever they are now (their subcollections, or `sensitive/` after a flip), each flipped to `retracted: true` (`hardDelete`: deleted), plus the rebuilt card, in one version-pinned batch. Records already flipped are skipped; a chunk with none left only makes sure the card caught up.
3. Set `retraction: done` (`hardDelete`: delete the Entry).

### Reading

- **`connect`** → `{backend, url, cycle, setup}`. Finds the current Cycle through the pointer. With no current Cycle in the pointer, it looks the Commander's Cycles up (on the artifact backend by the page title "מעקב חניכים · <Cycle>"), leaving out the pointer's `archived`: one match is used and saved as the pointer, several are put to the Commander as a choice. Fails with "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`" when there is none.
- **`readCycle`** → `{cycle, skills, preset, commander: {settings, hides}, playbook, teams}`. `teams`: every Project team, each with its `id`.
- **`readTeam`** → every Trainee card, each with its `id`, those who left included (`active: false`). Team views (Talk circles, status, shared weaknesses, team averages) count only active Trainees.
- **`readTrainee(tid, since?, retracted?)`** → `{card, evidence, assessments, followups, items, changes, sensitive, entries}` for one Trainee. `since` (`YYYY-MM-DD`) limits Evidence, Assessments and sensitive records by the day they happened, and Entries by the day they were written. Default for a brief or Trainee question: 6 weeks back. Retracted records and Entries are left out unless `retracted` is true (only to find a retracted Entry, e.g. for `hardDelete`, or when the Commander asks what they withdrew).

### Recording

- **`recordEntry({text, evidence: [...], assessments: [...], insist?})`** → `{entry, evidence: [ids], sensitive: [ids], followups: [ids], assessments: [ids]}`. Keeps `text` word-for-word as an Entry and writes each Evidence under its Trainee, plus the Follow-ups it opens, then updates the touched cards (a Talk moves `lastTalk` forward, never back, even a wholly sensitive one; opened Follow-ups join the card's `followups`, sensitive ones as the marker; closed ones leave it).
  Each Evidence: `trainee`, `kind`, `date`, `excerpt`, its kind's fields, optional `closes: [Follow-up ids]`, optional `followups: [text…]` to open, and optional `sensitive: [part…]`, the sensitive parts cut out of it. Kinds and their fields (a field left out is stored at the default shown):

  | Kind | Fields |
  |---|---|
  | `talk` | `topics: []` |
  | `test` | `subject: null`, `test: null`, `unlisted: false`, `score: null`, `self: null` |
  | `code-review` | `subject: null`, `test: null`, `unlisted: false` |
  | `project-observation` | `project: null` (a preset Project id); `team` is not given: it is stored as the id of the Project team of that Project the Trainee is in, or `null` |
  | `clarification` | `clarifies` (required: the id of the same Trainee's Evidence it corrects) |
  | `self-assessment`, `improve-keep`, `goal`, `background`, `evaluation-event`, `note` | none |

  A listed Test's `subject` is stored as the preset gives it. Every Evidence also stores `closes` (default `[]`). A Follow-up is `{entry, trainee, text, from: <Evidence id>, date: <its Evidence's date>, at, retracted: false}` in the Trainee's `followups`; it is open until a non-retracted Evidence of that Trainee (sensitive parts included) lists it in `closes`.
  A sensitive part: `category`, `excerpt` (the sensitive sentence or sentences, word-for-word, one stretch of the Entry), optional `kind` (`note` by default, or `background`, `goal`, `self-assessment`, `improve-keep`, `evaluation-event`), optional `closes` and `followups`. It is stored at `sensitive/<id>` as `{record: "evidence", entry, trainee, kind, category, date: <its Evidence's date>, excerpt, in: <its Evidence's id>, closes, at, retracted: false}`; the Follow-ups it opens are stored at `sensitive/<id>` as Follow-ups plus `record: "followup"`. The public Evidence's `excerpt` is its stretch of the Entry with each sensitive part replaced by "[פרט אישי — בתיק]": the text around the markers is copied from the Entry, in order. A wholly sensitive Evidence keeps a public excerpt of just the marker, so the Talk itself still shows.
  Each Assessment (optional): `trainee`, `skill`, `score`, `author`, `reason`, `evidence: [refs]`, where a ref is `#<n>` for this Entry's record `<entryId>-<n>` (an Evidence or sensitive part of that Trainee) or a stored Evidence id. Stored as above, with `entry` = this Entry, and joins that Trainee's card `skills`.
  Ids: the Evidence first, `<entryId>-1…`, in the order given, then the sensitive parts in the order given, then the Follow-ups: each Evidence's own, then its sensitive parts', in the order given, then the Assessments in the order given.
  Refuses, writing nothing, when: there is no Evidence; an Evidence is about a Trainee who left, unless `insist` is true (the Commander asked to record it anyway; the Trainee stays left); an excerpt or Follow-up text is not copied word-for-word from `text`; a Trainee id or kind is unknown; a date is not `YYYY-MM-DD`; a field does not belong to the kind; `score` is not a number; `test` is not a canonical Test name in the Cycle's preset (unless `unlisted: true`, which a canonical name may not carry); `test` and `subject` disagree with the preset; `project` is not a preset Project; `clarifies` names no Evidence of that Trainee (public or sensitive; a retracted one counts as none); `closes` names a Follow-up that is not open on that Trainee's card; a sensitive part has an unknown category, an excerpt not copied from `text`, another kind or field; an Evidence has a sensitive part but no marker, or a marker but no sensitive part; a public excerpt (the text around its markers) or public Follow-up reaches into a sensitive part's excerpt anywhere in the Entry, even a few words of it (words that also stand elsewhere in the Entry are fine).
  Also refuses an Assessment with an unknown Trainee or Skill, an archived Skill, a score that is not a whole number 1–5, another author, an empty reason, no Evidence, a ref that is not a live Evidence of that Trainee (a Follow-up, another Trainee's, a retracted one, a number past this Entry's records), a `trainee` Assessment citing no `self-assessment` Evidence, or a second Assessment by the same author on the same Trainee and Skill.
  Runs the Entry write protocol above. Refuses an Entry that gives one Trainee more records than fit in one chunk (49 plus the card). Later: improve/keep items in the same call.
- **`recordAssessments(tid, assessments: [...], insist?)`** → `{assessments: [ids]}`. Refuses a Trainee who left unless `insist` is true. Assessments of one Trainee outside an Entry: a re-rate ("תדרג מחדש") or an accepted proposal. Each as in `recordEntry` minus `trainee`, citing stored Evidence ids only; stored with `entry: null`, dated today, ids `a-YYYYMMDD-HHMM-<rand2>`, in one version-pinned write with the card. Refuses as `recordEntry` does for its Assessments, and an empty list.
- **`retractEntry(eid?)`** → `{entry, trainees, retracted: [record ids]}`. Retracts the named Entry, or the last one written (latest `at`, then id; an Entry being hard-deleted is skipped): sets `retracted: {at}` on the Entry and `retracted: true` on every record cut from it (in `sensitive/` too, wherever a flip has moved it), then rebuilds the touched cards, by the Retraction protocol above. Nothing is deleted or edited. Records of other Entries are untouched, so a Follow-up the retracted Evidence closed opens again, and Assessments elsewhere that cite it count it out of their `n`. Refuses an unknown id, a retracted Entry ("already retracted", also when the last Entry is one: it never reaches past it to an older Entry), and a store with no Entry.
- **`updateTrainee(tid?, change)`** → the new card, with its `id`. One roster change, written as a `changes` record plus the rebuilt card in one version-pinned step. Only after the Commander confirms. `change` is exactly one of:
  - `{add: {name}}`, with no `tid`: a new Trainee `t-<rand6>`, its `changes/added` record and its card.
  - `{rename: {name}}`: a `renamed` record; the card's `name` follows it. Used to give a Trainee a distinguishing label ("נועה כ.").
  - `{leave: {date, how, reason}}`: a `left` record. `date` `YYYY-MM-DD`; `how` is `dismissal`, `transfer` or `other`; `reason` is short and display-safe (the card shows it). Their records stay, read-only.
  - `{rejoin: {}}`: a `rejoined` record; they are active again.
  Refuses an unknown Trainee, a `tid` with `add`, a display name that clashes with another Trainee's, one who left included (two display names clash when they are the same ignoring case and spacing, or when one is a bare first name the other starts with ("נועה" and "נועה כ."): ask for a short label for both), an empty name, leaving twice, rejoining someone who hasn't left, a `leave` without a valid date (a future one included), `how` or reason, and any other change. Status and evaluation-process stage changes: later.
- **`updateSettings(change)`** → the new `commander/settings`. Any of `name`, `role` (`null` clears it), `talk: {target?, yellow?, red?}` (days; the rest stay as they were). Only after the Commander confirms. Refuses an empty change, an unknown setting, an empty name, a Talk value that is not a whole number of at least 1, `yellow` not below `red`, and `target` past `yellow`. The dashboard's Talk circles follow the new values.
- **`updateCycle(change)`** → the changed document. One change to this Cycle, pinned to the version read. Only after the Commander confirms. `change` is exactly one of:
  - `{addTest: {name, subject, number?, aliases?}}`: appends a Test to `meta/preset.tests` with id `<subject>.<name slug>` (`<subject>.t-<rand4>` when the slug is empty). Refuses an unknown Subject id and a name or alias already used by a Test (ignoring case and spacing). → the preset.
  - `{editTest: {test, name?, number?, aliases?}}`: the Test known by `test` (name or alias); a new `name` keeps the old one as an alias, `aliases` are added. Refuses an unknown Test, nothing to change, and a name or alias another Test uses. → the preset.
  - `{removeTest: {test}}`: takes the Test out of this Cycle's catalog (Evidence already recorded keeps its words). → the preset.
  - `{addProject: {name, subject, aliases?}}`: appends `{id: <name slug or p-rand4>, subject, name, aliases}` to `projects`. Refuses an unknown Subject and a name or alias another Project uses. → the preset.
  - `{removeProject: {project}}`: takes the Project known by `project` (id, name or alias) out of `projects` and out of every week of the `schedule` (Evidence already recorded keeps its Project id). Refuses an unknown Project and one that still has a Project team. → the preset.
  - `{setWeek: {week, subjects, projects?}}`: replaces that week of the `schedule` (or adds it). Refuses a week below 1, an unknown Subject or Project id. → the preset.
  - `{removeWeek: {week}}`: drops the last week from the `schedule`, for a shorter course (one call per week dropped). Refuses a week not in it and any week but the last (change that one with `setWeek`). → the preset.
  - `{addSkill: {group, name}}`: appends `{id: <group>.c-<rand4>, name, added: at}` to that Stage or the Interpersonal group in `meta/skills`. Refuses an unknown group, an empty name, and a name already in that group (an archived one: restore it). → `{skill, skills}`.
  - `{archiveSkill: {skill}}` / `{restoreSkill: {skill}}`: sets `archived: true, archivedAt` on a Skill, or drops them. Never deleted: its Assessments stay and keep counting on the card, but an archived Skill takes no new Assessment. Refuses an unknown Skill, archiving twice, and restoring one that isn't archived. → `{skill, skills}`.
  - `{setTeam: {id?, project, name, members}}`: creates `teams/tm-<rand4>`, or replaces team `id`, as `{project, name, members, at}`. Refuses an unknown Project, an empty name, no members, an unknown Trainee, an unknown `id`, and a Trainee already in another team of that Project. → the team, with its `id`.

### Dashboard

- **`openDashboard`** → shows the Commander their Cycle's dashboard page.

### Setup

- **`createCycle({commander: {name, role?, talk?}, cycle: {name, start?}, trainees})`** → `{url, trainees: [{id, name}]}`. Used only by setup. Writes the pointer first, then seeds `meta/cycle` (`setup: in-progress`; `start` defaults to today), `meta/skills`, `meta/preset` (a copy of the shipped Course preset), `commander/settings` (`role` null and Talk target 10, yellow 10, red 14 unless given), `commander/hides` and, per Trainee, an `added` change record plus its card (so the card can be rebuilt from records). It leaves `setup: in-progress`: setup then makes its other changes with the ordinary operations (`updateCycle`, `recordEntry`) and ends with `finishSetup`. Called again after an interrupted setup, it finishes the same store: it keeps the Trainees, the Skill framework and the preset already there (with the changes setup made to them), and the start date, role and Talk values already stored unless given again; the Cycle name and Commander name are the ones given. Refuses when the current Cycle's setup is done, when two Trainees' display names clash (as `updateTrainee` says), a `start` that is not `YYYY-MM-DD`, and Talk values `updateSettings` would refuse.
- **`finishSetup()`** → `meta/cycle`, with `setup: done`. Setup's last write, after everything it seeds. Finishing twice is harmless. Refuses when no Cycle was seeded.

### Playbook and sensitive

- **`savePlaybookItem(item)`** → the item id. Saves or edits one of the Commander's own Playbook items (kind, text word-for-word, Skill ids or "general", optional band). Not built yet.
- **`retirePlaybookItem(id)`** → the item. Retires a Commander item; it stays stored. Not built yet.
- **`hidePlaybookItem(baseId, hidden)`** → `commander/hides`. Hides or un-hides a base Playbook item. Not built yet.
- **`flipSensitive(id, category?)`** → `{id, now: "public" | "sensitive", moved: [ids]}`. Refuses a retracted Evidence. Moves one Evidence, together with the Follow-ups it opened, between `sensitive/` and the Trainee's `evidence/` and `followups/`, same ids, in one atomic step with the rebuilt card. Into `sensitive/` it adds `record` and (on the Evidence) `category`, which is then required (one of the categories, or `other` when the Commander marks something none fits); out of it, both are dropped and `in` is kept. A public Evidence it came from keeps its marker. Refuses a Follow-up id (flip its Evidence) and an id that is no Evidence. If the Evidence's Entry is still `writing`, it finishes that Entry first, so a resume can't put the record back. Only on the Commander's word ("זה רגיש" / "זה לא רגיש").

### Maintenance

- **`rebuildCard(tid)`** → the card. Recomputes a Trainee card from that Trainee's non-retracted records alone (the Snapshot and next-Talk questions, which no record holds, carry over). Used after a version conflict and whenever a card looks wrong.
- **`resumePending()`** → `{finished: [entry ids]}`. Completes any Entry still marked `status: writing`, then any `retraction: writing`, then any `deletion: writing`, chunk by chunk, skipping chunks already written. Runs at the start of every `tracker` run.
- **`copyCommanderScope(fromUrl)`** → what was copied. Copies `commander/*` and `playbook/*` from a previous Cycle's store into the current one. Not built yet.
- **`hardDelete(eid)`** → `{entry, trainees, deleted: [record ids]}`. Permanently deletes the named Entry (retracted or not) and everything cut from it, `sensitive/` included, and rebuilds the touched cards, by the Retraction protocol above. As with a Retraction, records of other Entries are untouched: a Follow-up it closed opens again, and an Assessment elsewhere that cited it keeps counting with the id left dangling (out of its `n`). A session still finishing that Entry's chunks does not bring the records back. Only on the Commander's explicit request, after they confirmed; never on "בטל". Refuses without an id and an unknown id.
