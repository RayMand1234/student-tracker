# How does the domain model map onto the artifact database, behind what storage interface?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: raymandelvei (claimed 2026-10-29)
Blocked by:

## Question

Map the model from "What is the domain model of Trainees, Evidence and Ratings?" (03) onto collections and documents in the Cycle's artifact database, within the limits found by "Can a Claude Code plugin create and drive a Cycle's artifact database?" (01): 256 KiB per document, 25k documents, scan-only queries (≤10 `where`, one `order_by`, ≤1000 results), batches of ≤50 writes / 1 MiB, no transactions, `if_version` on every update.

Decide: the collection list and document granularity (one doc per Evidence vs per Trainee-month, etc.); where sensitive Evidence lives so page code never reads it; where durable Commander and Cycle settings and the course preset live (per the packaging research, nothing local syncs across machines); how derived values (Rating, Snapshot, last Talk date) are stored or computed; how one Entry's multi-document write stays consistent without transactions; and the shape of the swappable storage interface from ADR 0001 (the operations the skills call, so a later backend swap touches only that layer).

From "What does the Playbook look like and where does its base content come from?" (04): base Playbook items ship as plugin files and are never stored in the DB; the DB holds the Commander's own Playbook items and their per-Commander hide list over base items, both scoped to the Commander rather than the Cycle (they must survive into the next Cycle's artifact). Decide where those live given one artifact per Cycle, and give base items stable ids so hides survive plugin updates.

From "How does the agent turn Evidence into a 1–5 Rating?" (05): keep every Assessment (agent, Commander, Trainee; counting or not) dated and queryable per Trainee × Skill. Rating = latest Commander Assessment if any, else latest agent Assessment; Trend needs the Rating as of 4 weeks earlier; stale = latest counting Assessment >6 weeks old; the Rating also carries its Evidence count. Decide whether these are stored or computed by page code and agent.

From "What does `/student-tracker:setup` ask, and what does it create?" (06): store Commander settings (name, role, Talk thresholds) as Commander-scoped (prefilled into the next Cycle, like the Commander's Playbook items); the Cycle carries a setup state (`in-progress` → `done`) so an interrupted seed can resume; Trainees carry a display name (first name, or a distinguishing label like "נועה כ." for duplicates); setup-time Trainee info is stored as ordinary Entries and Evidence; the seed writes Commander settings, the Cycle (name, start date, Course preset copy, Skill framework), one document per Trainee and the setup Entries.

From "Which slash commands and auto-triggered skills does the plugin expose?" (07): an Entry can be retracted ("בטל"). Everything cut from it (Evidence, Assessments, Follow-ups, improve/keep items) stops counting and stops showing but stays stored. Decide how the Retraction is recorded, and how derived values and page queries exclude retracted items cheaply.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, one round: two Commander-facing questions plus nine agent-decided points, all accepted). The trade-off behind the Trainee card and the copy-forward is recorded in [ADR 0002](../../../docs/adr/0002-derived-trainee-card-and-commander-copy-forward.md).

**Collections in the Cycle's artifact DB**

```
meta/cycle           name, start date, setup state (in-progress | done), schema version (1)
meta/skills          Skill framework: Stages, Interpersonal group, added/archived Skills (stable ids, e.g. impl.debugging)
meta/preset          this Cycle's Course preset copy (Subjects, Tests + aliases, Projects, Schedule)
commander/settings   name, role, Talk target + yellow/red thresholds   ┐ Commander-scoped:
commander/hides      { hidden: [base Playbook item id, …] }            │ copied into the next
playbook/<id>        the Commander's Playbook items                    ┘ Cycle's DB at setup
trainees/<tid>       Trainee card: current state + derived cache (the page reads this)
trainees/<tid>/evidence/<id>      public Evidence            ┐
trainees/<tid>/assessments/<id>   every Assessment           │ sources: immutable content,
trainees/<tid>/followups/<id>     Follow-ups                 │ each with entry id and
trainees/<tid>/items/<id>         improve/keep items         │ retracted: false
trainees/<tid>/changes/<id>       Status + Evaluation-stage changes ┘
teams/<id>           Project teams
entries/<eid>        raw Entries, whole and word-for-word (the page never reads them)
sensitive/<id>       sensitive Evidence, plus Follow-ups / improve-keep items quoting it (the page never reads them)
```

**Decided with the Commander**
- **The dashboard never shows raw Entries.** An Entry can hold a sensitive sentence word for word, so the page reads only the cut, redacted Evidence. The whole message is available in chat ("מה כתבתי על נועה ב-12/10?").
- **Commander-scoped data is copied forward**, not shared through a second artifact. A new Cycle's setup copies `commander/*` and `playbook/*` from the previous Cycle's artifact. Edits after that live only in the current Cycle, and archived artifacts are read-only by convention. One artifact per Cycle still holds.

**Agent-decided (veto any)**
1. **One document per record**, in per-Trainee subcollections. Estimate: 12 Trainees × 21 weeks ≈ 400 Entries, 1.2k Evidence, 2k Assessments, about 4–5k documents in all. That is well under the 25k cap, and each query scans only one Trainee's few hundred documents.
2. **The Trainee card is a derived cache** at `trainees/<tid>`. It holds:
   - display name, active/left (+ date, reason), Status, Evaluation-process stage and last Talk date
   - the Snapshot `{text, at}`, active improve/keep items and open Follow-ups (display-safe copies)
   - per Skill, the counting Assessments as `[[date, score, author], …]` (agent and Commander, not retracted) plus the Evidence count `n`

   Page code and the agent compute the Rating, Trend and stale flag from that list at read time, using the rules from "How does the agent turn Evidence into a 1–5 Rating?" (05). They are computed because Trend and stale move with today's date. The card is always rebuildable from the sources, and the team view and Skill grid cost one subscription to `trainees`. 31 Skills × a few changes each stays far below 256 KiB.
3. **Consistency without transactions.**
   - `recordEntry` first writes the Entry with `status: writing` and the list of Trainees it touches.
   - It then writes one chunk per Trainee: that Trainee's new records plus their card update, pinned with `if_version`, so each chunk is atomic and ≤50 writes / 1 MiB.
   - Last, it sets the Entry to `status: done`.
   - Child ids are deterministic (`<entryId>-<n>`). A retried create on an existing document is refused, so a retry can't duplicate.
   - Every `tracker` run starts with `resumePending`, which finishes any Entry (or Retraction) still marked `writing`.
   - A version conflict on a card means re-read the sources and rebuild the card.
4. **Retraction**:
   - The Entry gets `retracted: {at}`.
   - Every child record carries `retracted: false` from creation, and the Retraction sets it to `true`. That is a flag change only; the content stays untouched.
   - Queries filter on `retracted == false`. They never rely on a missing field.
   - The cards of the affected Trainees are rebuilt. The work uses the same chunked, resumable protocol, marked by `retraction: writing | done` on the Entry.
5. **Sensitive data.**
   - These live in `sensitive/` with a `trainee` field: sensitive Evidence, and Follow-ups or improve/keep items whose text comes from it.
   - Assessment reasons, Snapshots and Status-change reasons are written display-safe: they cite sensitive Evidence by id only, and the page shows "[פרט אישי — בתיק]" for an id it can't resolve.
   - Flipping the mark moves the document between `sensitive/` and the Trainee's `evidence/` in one pinned (hence atomic) batch, with the same id.
6. **Commander scope and base ids.**
   - Base Playbook items carry a stable `id` field in the plugin files, never reused.
   - Hides pointing at an id that no longer ships are ignored.
   - Commander settings prefill the next Cycle by being copied with the rest of the Commander scope.
7. **Storage interface.**
   - It is one reference file, `skills/tracker/references/storage.md`, that defines backend-neutral operations. The skills call only these:
     - Reading: `connect` (the pointer lookup from 06), `readCycle` (cycle, skills, preset, Commander scope), `readTeam` (all cards), `readTrainee(tid, since)` (card + sources + that Trainee's sensitive records since a date)
     - Recording: `recordEntry`, `retractEntry`, `updateTrainee` (roster, Status, Evaluation stage, left), `updateSettings`, `updateCycle` (preset, Skills, teams)
     - Playbook and sensitive: `savePlaybookItem`, `retirePlaybookItem`, `hidePlaybookItem`, `flipSensitive`
     - Maintenance: `rebuildCard`, `resumePending`, `copyCommanderScope(fromUrl)`, `hardDelete` (only on the Commander's explicit request)
   - The ArtifactData mapping is a sibling file, `storage-artifact.md`: paths, `if_version`, batching, `out_dir` for large reads.
   - The dashboard page belongs to the artifact backend, so a backend swap replaces it together with `storage-artifact.md`.
8. **Loading the brain.** A session reads `readCycle` + `readTeam` (N small cards) for team questions. For a brief or a Trainee question it also reads `readTrainee(tid, since: 6 weeks)`, widening only when asked. Large reads go through `out_dir` into the scratchpad. This closes the map's "Loading the brain each session" fog.
9. **Ids and dates.**
   - Entries: `e-YYYYMMDD-HHMM-<rand2>`, time-sortable. Children: `<entryId>-<n>`. Trainees: `t-<rand6>`, never a name. Standalone Assessments from a re-rate: `a-YYYYMMDD-HHMM-<rand2>`, with `entry: null`.
   - Evidence has a `date`: the day the thing happened, which may differ from when it was written. Every record has an `at` ISO timestamp with offset.
   - `meta/cycle.schema = 1` lets later plugin versions migrate.

Knock-on effects recorded on other tickets: the dashboard prototype reads only `trainees`, `meta/*`, `teams` and per-Trainee subcollections. It never reads `entries` or `sensitive`, computes Rating/Trend/stale from the card's Assessment list, and filters `retracted == false`. The "Cycle lifecycle" fog inherits `copyCommanderScope`.

**Later addition (from "How should the dashboard artifact look and behave?" (08), 2026-10-29):** the Trainee card gains `nextTalk: {questions: [...], at}`. These are 2–3 display-safe suggested Talk questions, marked "הצעה", which the agent rewrites in the same chunk as any card update for that Trainee. The page also reads `teams` to show a Trainee's Project team. Growth charts replay the card's counting-Assessment list week by week, so they need no new storage.
