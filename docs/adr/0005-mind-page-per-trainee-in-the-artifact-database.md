# A Mind page per Trainee, kept in the artifact database

The Commander wanted the tracker to keep closer track of each Trainee the way their personal `rays-mind` wiki does: one page per person that accumulates patterns, agreements and open contradictions across months. The Snapshot is too short for that and the card is derived from records, so the Mind is a separate document, `mind/<tid>`, written whole by the agent through the store's `record-mind` and read with `read-mind`.

It lives in the Cycle's artifact database, behind the same storage layer, so it follows ADR-0001 (reachable from any device, one backend). A local Markdown folder (Obsidian-style, like `rays-mind`) was the alternative: simpler, but only on one machine and it would put sensitive text in plain files.

## Consequences

- The page is the agent's synthesis, not Evidence. It is never authoritative: the Entries and Evidence stay the record, and nothing derives from the page. `rebuild-card` ignores it.
- It is not versioned by Entry, so a Retraction or Hard delete does not touch it by itself. The retract route tells the agent to rewrite the page of each touched Trainee.
- One document per Trainee is bounded by the 256 KiB cap. The page rule asks for about 25 KB (measured on `rays-mind`: the largest Trainee page after months was 25 KB) and to fold old lines into counted patterns. The store refuses a bigger page. The total-size quota of the artifact database is not published.
- Reading a page costs tokens, so only the brief and advice read it, and only for the one Trainee.
- No Obsidian graph view. Export to Markdown is not built.

## Rollout to existing Cycles

No migration step and no version bump: the plugin has no version number, so a marketplace update delivers the new instructions and the store operations, and the `mind` collection is created by the first `record-mind`. Existing Cycles' dashboard pages are untouched. Pages appear for each Trainee the next time the Commander logs an update about them; `/student-tracker:mind` builds all missing pages at once from the records.
