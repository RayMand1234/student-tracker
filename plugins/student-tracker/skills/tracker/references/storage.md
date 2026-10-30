# Storage interface

All Trainee data for a Cycle lives in one store. Skills touch it **only** through the operations below; how each operation runs depends on the backend. This file is backend-neutral: it says what an operation does, never how a backend does it.

## Choosing the backend

The pointer file `cycles.json` = `{current, archived: [...]}` lives in the plugin data dir and holds only store addresses. The form of `current` picks the backend:

| `current` looks like | Backend | Mapping file | Status |
|---|---|---|---|
| `local:<dir>` | local JSON files, for tests | [storage-local.md](storage-local.md) | in use |
| `https://claude.ai/…` | the Cycle's artifact database | `storage-artifact.md` | not built yet |

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

Trainee card: `name`, `active`, `left`, `status`, `evalStage`, `lastTalk`, `snapshot {text, at}`, display-safe `items` and `followups`, `nextTalk {questions, at}`, and `skills` (per Skill id, the counting Assessments `[[date, score, author], …]` plus Evidence count `n`). Rating, Trend and stale are computed when read, never stored.

## Operations

Every write refuses, writing nothing, when its input is invalid, and says why. Records are never edited: a change is a new record or a flag flip.

### Reading

- **`connect`** → `{backend, url, cycle, setup}`. Finds the current Cycle through the pointer. Fails with "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`" when there is none.
- **`readCycle`** → `{cycle, skills, preset, commander: {settings, hides}, playbook}`.
- **`readTeam`** → every Trainee card, each with its `id`.
- **`readTrainee(tid, since?)`** → `{card, evidence, assessments, followups, items, changes, sensitive, entries}` for one Trainee. `since` (`YYYY-MM-DD`) limits Evidence, Assessments and sensitive records by the day they happened, and Entries by the day they were written. Default for a brief or Trainee question: 6 weeks back.

### Recording

- **`recordEntry({text, evidence: [...]})`** → `{entry, evidence: [ids]}`. Keeps `text` word-for-word as an Entry and writes each Evidence (`trainee`, `kind`, `date`, `excerpt`, kind-specific fields such as Talk `topics`) under its Trainee, then updates the touched cards (a Talk moves `lastTalk` forward, never back). Refuses when there is no Evidence, an excerpt is not copied word-for-word from `text`, a Trainee id is unknown, a kind is unknown, or a date is not `YYYY-MM-DD`.
  Kinds: `talk`, `test`, `code-review`, `project-observation`, `self-assessment`, `improve-keep`, `goal`, `background`, `evaluation-event`, `note`, `clarification`.
  Later: Assessments, Follow-ups and improve/keep items in the same call; one atomic chunk per Trainee, the Entry marked `writing` → `done`.
- **`retractEntry(eid?)`** → `{entry, trainees}`. Retracts the named Entry, or the last one: sets `retracted: {at}` on the Entry and `retracted: true` on every record cut from it, then rebuilds the touched cards. Nothing is deleted or edited. Not built yet.
- **`updateTrainee(tid?, change)`** → the new card. Adds a Trainee, or records a Status change, an evaluation-process stage change, or a Trainee leaving (date, reason), each as a `changes` record plus the card update. Only after the Commander confirms. Not built yet.
- **`updateSettings(change)`** → the new `commander/settings`. Commander name, role, Talk target and yellow/red thresholds. Only after the Commander confirms. Not built yet.
- **`updateCycle(change)`** → the changed document. Edits this Cycle's preset copy, adds or archives a Skill, records a Project team. Only after the Commander confirms. Not built yet.

### Setup

- **`createCycle({commander, cycle, trainees})`** → `{url, trainees: [{id, name}]}`. Used only by setup. Writes the pointer first, then seeds `meta/cycle` (`setup: in-progress`), `meta/skills`, `commander/settings` (default Talk target 10, yellow 10, red 14), `commander/hides` and one card per Trainee, then sets `setup: done`. Called again after an interrupted seed, it finishes the same store and keeps the Trainees already there. Refuses when the current Cycle's setup is done, and when two Trainees share a display name.

### Playbook and sensitive

- **`savePlaybookItem(item)`** → the item id. Saves or edits one of the Commander's own Playbook items (kind, text word-for-word, Skill ids or "general", optional band). Not built yet.
- **`retirePlaybookItem(id)`** → the item. Retires a Commander item; it stays stored. Not built yet.
- **`hidePlaybookItem(baseId, hidden)`** → `commander/hides`. Hides or un-hides a base Playbook item. Not built yet.
- **`flipSensitive(id)`** → the record's new place. Moves one record between `sensitive/` and the Trainee's `evidence/`, same id, in one atomic step, and rebuilds the card. Not built yet.

### Maintenance

- **`rebuildCard(tid)`** → the card. Recomputes a Trainee card from that Trainee's non-retracted records alone. Not built yet.
- **`resumePending()`** → the Entries it finished. Completes any Entry or Retraction still marked `writing`. Runs at the start of every `tracker` run once built. Not built yet.
- **`copyCommanderScope(fromUrl)`** → what was copied. Copies `commander/*` and `playbook/*` from a previous Cycle's store into the current one. Not built yet.
- **`hardDelete(target)`** → what was removed. Permanently deletes an Entry and everything cut from it, only on the Commander's explicit request. Not built yet.
