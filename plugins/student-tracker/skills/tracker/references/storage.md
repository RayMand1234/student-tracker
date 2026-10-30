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
teams/<id>           Project teams
entries/<eid>        raw Entries, whole and word-for-word
sensitive/<id>       sensitive Evidence and what quotes it
```

Ids: Trainees `t-<rand6>` (never a name); Entries `e-YYYYMMDD-HHMM-<rand2>`; records cut from an Entry `<entryId>-<n>`; standalone re-rate Assessments `a-YYYYMMDD-HHMM-<rand2>`. Evidence has `date` (the day it happened, `YYYY-MM-DD`); every record has `at` (ISO timestamp with offset).

Trainee card: `name`, `active`, `left`, `status`, `evalStage`, `lastTalk`, `snapshot {text, at}`, display-safe `items`, the open `followups` (`[{id, text, date}]`, oldest first), `nextTalk {questions, at}`, and `skills` (per Skill id, the counting Assessments `[[date, score, author], …]` plus Evidence count `n`). Rating, Trend and stale are computed when read, never stored.

## Operations

Every write refuses, writing nothing, when its input is invalid, and says why. Records are never edited: a change is a new record or a flag flip.

Write rules every backend keeps: creating a document whose id exists is refused, so a retry can't duplicate; a write to an existing document pins the version last read and is refused if it moved; a batch is 1–50 writes, ≤1 MiB, each document once. A batch with a pinned write is all-or-nothing; a batch without one applies in order and may stop part-way.

**Entry write protocol.** `recordEntry` (and later `retractEntry`) runs in steps any session can finish:
1. Write the Entry with `status: writing`, its touched Trainees and the full plan of records it will cut.
2. One chunk per Trainee: that Trainee's new records plus their card, in one version-pinned batch. If the card moved meanwhile, write the records alone and `rebuildCard`.
3. Mark the Entry `done` and drop the plan.
Child ids are `<entryId>-<n>`, fixed in step 1, so redoing a chunk never duplicates a record.

### Reading

- **`connect`** → `{backend, url, cycle, setup}`. Finds the current Cycle through the pointer. With no pointer on the artifact backend, it looks the Cycle up by its page title "מעקב חניכים · <Cycle>": one match is used and saved as the pointer, several are put to the Commander as a choice. Fails with "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`" when there is none.
- **`readCycle`** → `{cycle, skills, preset, commander: {settings, hides}, playbook}`.
- **`readTeam`** → every Trainee card, each with its `id`.
- **`readTrainee(tid, since?)`** → `{card, evidence, assessments, followups, items, changes, sensitive, entries}` for one Trainee. `since` (`YYYY-MM-DD`) limits Evidence, Assessments and sensitive records by the day they happened, and Entries by the day they were written. Default for a brief or Trainee question: 6 weeks back.

### Recording

- **`recordEntry({text, evidence: [...]})`** → `{entry, evidence: [ids], followups: [ids]}`. Keeps `text` word-for-word as an Entry and writes each Evidence under its Trainee, plus the Follow-ups it opens, then updates the touched cards (a Talk moves `lastTalk` forward, never back; opened Follow-ups join the card's `followups`, closed ones leave it).
  Each Evidence: `trainee`, `kind`, `date`, `excerpt`, its kind's fields, optional `closes: [Follow-up ids]` and optional `followups: [text…]` to open. Kinds and their fields (a field left out is stored at the default shown):

  | Kind | Fields |
  |---|---|
  | `talk` | `topics: []` |
  | `test` | `subject: null`, `test: null`, `unlisted: false`, `score: null`, `self: null` |
  | `code-review` | `subject: null`, `test: null`, `unlisted: false` |
  | `project-observation` | `project: null` (a preset Project id) |
  | `clarification` | `clarifies` (required: the id of the same Trainee's Evidence it corrects) |
  | `self-assessment`, `improve-keep`, `goal`, `background`, `evaluation-event`, `note` | none |

  A listed Test's `subject` is stored as the preset gives it. Every Evidence also stores `closes` (default `[]`). A Follow-up is `{entry, trainee, text, from: <Evidence id>, date: <its Evidence's date>, at, retracted: false}` in the Trainee's `followups`; it is open until a non-retracted Evidence of that Trainee lists it in `closes`. Ids: the Evidence first, `<entryId>-1…`, in the order given, then the Follow-ups in the order given.
  Refuses, writing nothing, when: there is no Evidence; an excerpt or Follow-up text is not copied word-for-word from `text`; a Trainee id or kind is unknown; a date is not `YYYY-MM-DD`; a field does not belong to the kind; `score` is not a number; `test` is not a canonical Test name in the Cycle's preset (unless `unlisted: true`, which a canonical name may not carry); `test` and `subject` disagree with the preset; `project` is not a preset Project; `clarifies` names no Evidence of that Trainee; `closes` names a Follow-up that is not open on that Trainee's card.
  Runs the Entry write protocol above. Refuses an Entry that gives one Trainee more records than fit in one chunk (49 plus the card). Later: Assessments and improve/keep items in the same call.
- **`retractEntry(eid?)`** → `{entry, trainees}`. Retracts the named Entry, or the last one: sets `retracted: {at}` on the Entry and `retracted: true` on every record cut from it, then rebuilds the touched cards. Nothing is deleted or edited. Not built yet.
- **`updateTrainee(tid?, change)`** → the new card. Adds a Trainee, or records a Status change, an evaluation-process stage change, or a Trainee leaving (date, reason), each as a `changes` record plus the card update. Only after the Commander confirms. Not built yet.
- **`updateSettings(change)`** → the new `commander/settings`. Commander name, role, Talk target and yellow/red thresholds. Only after the Commander confirms. Not built yet.
- **`updateCycle(change)`** → the changed document. Edits this Cycle's preset copy, adds or archives a Skill, records a Project team. Only after the Commander confirms. Built so far: `{addTest: {name, subject, number?, aliases?}}` appends a Test to `meta/preset.tests` with id `<subject>.<name slug>`; refuses an unknown Subject id and a name or alias already used by a Test (ignoring case and spacing).

### Dashboard

- **`openDashboard`** → shows the Commander their Cycle's dashboard page.

### Setup

- **`createCycle({commander, cycle, trainees})`** → `{url, trainees: [{id, name}]}`. Used only by setup. Writes the pointer first, then seeds `meta/cycle` (`setup: in-progress`), `meta/skills`, `meta/preset` (a copy of the shipped Course preset), `commander/settings` (default Talk target 10, yellow 10, red 14), `commander/hides` and, per Trainee, an `added` change record plus its card (so the card can be rebuilt from records), then sets `setup: done`. Called again after an interrupted seed, it finishes the same store and keeps the Trainees already there. Refuses when the current Cycle's setup is done, and when two Trainees share a display name.

### Playbook and sensitive

- **`savePlaybookItem(item)`** → the item id. Saves or edits one of the Commander's own Playbook items (kind, text word-for-word, Skill ids or "general", optional band). Not built yet.
- **`retirePlaybookItem(id)`** → the item. Retires a Commander item; it stays stored. Not built yet.
- **`hidePlaybookItem(baseId, hidden)`** → `commander/hides`. Hides or un-hides a base Playbook item. Not built yet.
- **`flipSensitive(id)`** → the record's new place. Moves one record between `sensitive/` and the Trainee's `evidence/`, same id, in one atomic step, and rebuilds the card. Not built yet.

### Maintenance

- **`rebuildCard(tid)`** → the card. Recomputes a Trainee card from that Trainee's non-retracted records alone (the Snapshot and next-Talk questions, which no record holds, carry over). Used after a version conflict and whenever a card looks wrong.
- **`resumePending()`** → `{finished: [entry ids]}`. Completes any Entry still marked `writing`, chunk by chunk, skipping chunks already written. Runs at the start of every `tracker` run.
- **`copyCommanderScope(fromUrl)`** → what was copied. Copies `commander/*` and `playbook/*` from a previous Cycle's store into the current one. Not built yet.
- **`hardDelete(target)`** → what was removed. Permanently deletes an Entry and everything cut from it, only on the Commander's explicit request. Not built yet.
