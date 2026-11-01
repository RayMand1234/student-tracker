# Derived Trainee card over immutable records; Commander data copied forward per Cycle

The artifact database has no indexes, no transactions and scan-only queries, and Trend and stale Ratings move with today's date. So each Trainee gets one derived card document (current state plus the counting Assessments per Skill), rebuilt from immutable per-Trainee records after every write. The dashboard and the agent read cards for team views and compute Rating, Trend and stale at read time. Each Entry is written in per-Trainee chunks that are atomic because each chunk pins the card's version, and a `writing` → `done` mark on the Entry lets any later session finish an interrupted write.

Commander-scoped data (settings, Playbook items, hides over base items) lives in each Cycle's database and is copied into the next Cycle's database when it is set up, keeping one artifact per Cycle.

## Considered Options

- **Stored Rating/Trend/stale values**: cheapest to render, but Trend and stale go wrong as days pass with no new writes. Rejected.
- **Page computes everything from raw Assessments**: always correct, but one subscription per Trainee per collection, and scans grow over 21 weeks. Rejected.
- **A second, long-lived "Commander" artifact** for Commander-scoped data: no copying, but a second pinned page, a second publish permission and two URLs to recover on every machine. Rejected by the Commander.

## Consequences

- A card can drift from its records after a crash or a concurrent write. It is never authoritative, and `rebuildCard` restores it.
- Edits to Commander-scoped data made in an archived Cycle's artifact don't carry forward. Archived artifacts are read-only by convention.

## Later notes (build, 2026-10-30)

- The card is derived from records alone except `nextTalk`'s first versions: Status, evaluation stage, Snapshot, improve/keep items and next-Talk questions are all records (`changes`, `items`), so a Retraction or `rebuildCard` restores what came before (tickets 19, 23).
- The Commander's own Playbook items are editable advice, not Evidence, so they are edited in place, version-pinned (ticket 24). Trainee records stay immutable.
- `copyCommanderScope` also carries a Skill the Commander added in the previous Cycle when one of their Playbook items is tagged to it, so the item stays usable (ticket 26).
- The previous Cycle's address moves to the pointer's `archived` list when the new Cycle is created, before the copy, so it can't be lost if setup stops between the two (ticket 26).
