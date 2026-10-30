# 15: Sensitive Evidence

**Spec:** `.scratch/student-tracker/spec.md` (Sensitive details stories; Storage → sensitive); ticket 03 decision 8

**What to build:** Sensitive details are kept but never reach the dashboard. A sentence about health, family, distress, finances, romantic relationships or discipline/legal matters is split into its own sensitive Evidence stored apart; the public Evidence keeps the rest with "[פרט אישי — בתיק]" in its place. The agent tells the Commander what it marked, and the Commander can flip the mark either way. In chat, the Commander can still read sensitive records and their original messages.

**Blocked by:** 14

**Status:** resolved

- [x] Sensitive Evidence, and Follow-ups / improve-keep items quoting it, live in the `sensitive` collection with a `trainee` field
- [x] Public Evidence carries "[פרט אישי — בתיק]" in place of the sensitive sentence
- [x] Derived text (Assessment reasons, Snapshots, Status-change reasons, card copies) cites sensitive Evidence by id only
- [x] The confirmation reply says what was marked sensitive; "זה לא רגיש" / "זה רגיש" flips it via `flipSensitive` (one pinned batch, same id)
- [x] A sign of serious distress adds a reminder to involve a professional (קב"ן / ת"ש / מפקד)
- [x] "מה כתבתי על נועה ב-12/10?" returns the raw Entry text in chat
- [x] Evals assert no sensitive text appears in any collection the page reads, nor in the confirmation line beyond the marker

## Comments

**2026-10-30 — implemented** (`lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/SKILL.md`, `skills/tracker/references/{log,storage,storage-local,storage-artifact,sensitive,recall}.md`, `test/sensitive.test.mjs`, `evals/sensitive.eval.mjs`).

- **Sensitive parts:** an Evidence in `recordEntry` takes `sensitive: [{category, excerpt, kind?, closes?, followups?}]`. Each part is stored at `sensitive/<eid>-<n>` as `{record: "evidence", trainee, kind (default note), category, excerpt, in: <public Evidence id>, …}`; the Follow-ups it opens sit next to it as `record: "followup"`. Numbering: Evidence, then sensitive parts, then Follow-ups. Categories `health`, `family`, `distress`, `finances`, `romance`, `discipline`.
- **Marker:** the public excerpt is its stretch of the Entry with "[פרט אישי — בתיק]" where each part was; the text around the markers must be copied in order. A marker with no part, or a part with no marker, is refused. A public excerpt or Follow-up that reaches into a sensitive stretch, even a few words of it, is refused (words that also stand elsewhere in the Entry are fine). A wholly sensitive Talk keeps a public excerpt of just the marker.
- **Card:** a sensitive Follow-up appears as `{id, text: "[פרט אישי — בתיק]", date}`, so `closes` checks stay card-based on both backends and the dashboard can show that something private is open. `lastTalk` counts Talks in `sensitive/` too (a date is not sensitive).
- **`flipSensitive(id, category?)`:** moves an Evidence and the Follow-ups it opened, same ids, in one pinned batch (deletes + creates + card). Moving in needs a category. If the Entry is still `writing`, it finishes that Entry first. Otherwise a later resume would recreate the record at its old place (found in review).
- **CLI:** `--- sensitive <category>` block after its Evidence (`+kind:`, `+closes:` lines, then the sentence, then its `--- followup` blocks); `flip-sensitive <evidence id> [--category c]`.
- **Agent rules:** log.md covers what counts as sensitive per category; the agent writes display-safe topics; serious distress adds "כדאי לערב גורם מקצועי (קב"ן / ת"ש / מפקד)". A sign of danger to life comes first, as urgent advice to act now. The reply names each marked part only by the marker and category. sensitive.md handles "זה לא רגיש" / "זה רגיש". recall.md covers "מה כתבתי על…" and quotes raw Entries word for word, in chat only.
- **Tests:** 11 unit tests (sensitive, CLI, resume, flip during a half-written Entry). 4 evals: a family sentence is cut and never echoed, nor visible to the page; distress gets the professional reminder; flip both ways under the same ids; recall quotes the raw Entry. The full eval suite passed (16/16).

Deviations / open points (agent-decided, veto any):
1. **`other` category**, accepted only on a Commander flip. "זה רגיש" on something no category fits used to stall (the eval agent refused to guess a category). The agent can't cut a part as `other` while logging.
2. **"זה רגיש" moves a whole Evidence.** To hide one sentence of an already-public Evidence, the whole Evidence is hidden; records are immutable, so a re-split would mean a new record. Unmarking a part leaves the marker in the public Evidence it was cut from, and the part shows as its own record.
3. **Distress eval checks only the confirmation lines.** When there is a sign of danger, the agent's urgent advice may cite what the Commander wrote, to explain why it is urgent. That is private chat, not a record, and the ticket's bar is the confirmation line. The eval's `קב"ן` check and its `<name> —` line split go slightly past the spec's "markers only" testing rule.
4. **Clarifications may name a sensitive Evidence**, citing it by id; log.md asks that such a correction be cut out as sensitive too.
5. **For ticket 17:** an Entry's `children` may now live in `sensitive/`, or have moved there or back with a flip. `retractEntry` has to look in both places (storage.md says so).
6. **Derived text cites by id only.** Today this is a rule in storage.md and log.md (Talk topics, card copies). Assessments, Snapshots and Status reasons arrive in tickets 16 and 19, which should keep it.
