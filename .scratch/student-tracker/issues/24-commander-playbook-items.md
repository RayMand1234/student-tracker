# 24: Commander Playbook items

**Spec:** `.scratch/student-tracker/spec.md` (Playbook stories 85–89); ticket 04 decisions 6–9

**What to build:** The Commander grows their own Playbook in chat. "תוסיף לפלייבוק של דיבאג: …" saves an item word-for-word after confirmation; the agent offers to save something that worked from an update but never adds without a yes. The Commander can edit or retire their items and hide or un-hide base items. For a Skill the Commander added, the agent offers draft items "(הצעה)"; accepted ones become Commander items.

**Blocked by:** 23

**Status:** resolved

- [x] `savePlaybookItem`, `retirePlaybookItem`, `hidePlaybookItem` implemented on both backends
- [x] Items stored in `playbook` with origin Commander and optional source Entry; hides in `commander/hides`
- [x] Every add is confirmed; offer-to-save never writes without a yes
- [x] Advice from ticket 23 prefers Commander items and excludes hidden base items
- [x] Evals: add, edit, retire, hide, un-hide, decline an offer

## Comments

**2026-10-30 — implemented** (`lib/playbook.mjs`, `lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/SKILL.md`, `skills/tracker/references/{playbook (new),log,roster,advice,storage,storage-local,storage-artifact}.md`, `test/playbook-items.test.mjs`, `test/cli.test.mjs`, `evals/playbook.eval.mjs`). Built on branch `ticket-24-commander-playbook`, based on `integration/v1` (a1aa819).

Decisions taken while building (agent-decided, veto any):

- **Item shape** stays the one `pickPlaybook` already read: `playbook/p-<rand4>` = `{origin: "commander", kind, skills, band | null, text, source: <Entry id> | null, at, edited?, retired: false | {at}}`. `pickPlaybook` and its tests are unchanged.
- **Commander items are edited in place**, version-pinned, unlike the immutable Trainee records: decision 8 says they are editable advice, not Evidence. An edit changes only the fields given (`band: null` clears it), keeps `id`, `at` and `source`, and sets `edited`. A retired item can't be edited or brought back; the Commander adds a new one instead.
- **`savePlaybookItem` returns the stored item** with its id, not just the id (storage.md updated). It refuses: unknown kind/band/Skill/field, an empty text, "general" mixed with Skills, a band on a general item, an archived Skill (newly tagged), editing a base `b-…` item, an unknown or retired item, an empty edit, changing `source`. Commander-added Skills (`.c-…`) take items.
- **An item with a `source` Entry** must be word-for-word in that Entry's text and must not repeat any sensitive part of it (the Playbook outlives the Cycle and feeds Advice). The Entry must be live (not retracted or deleted). Retracting the Entry later leaves the item.
- **`hidePlaybookItem` changes nothing on a repeat** (hiding something already hidden, or un-hiding something that isn't), so a retry is safe. Hiding refuses an id the shipped file doesn't have; un-hiding one is allowed, to clear a hide left over from an older plugin version. A `p-…` id is refused (retire it instead), and so is a `b-…` id on retire.
- **CLI:** `save-playbook-item [<id>]` with `+kind:` / `+skills:` / `+band: low|mid|high|none` / `+source:` lines, then the text (several lines allowed). Also `retire-playbook-item <id>`, `hide-playbook-item <base id>` and `unhide-playbook-item <base id>`.
- **`references/playbook.md`** follows roster.md's confirm-first pattern for every change: add, edit, retire, hide, un-hide and accepting drafts. These aren't Entries, so there's no Retraction line. The **offer to save** from an update is one line, `(הצעה) לשמור בפלייבוק (<Skill>, <kind>): "<words from the message>"? (כן / לא)`, before the Retraction line. It appears at most once per update, only when the reply asks nothing else, and never quotes a sensitive part or a name. A yes saves it with `source` = that Entry.
- **Draft items for an added Skill** are offered right after `addSkill` is applied, and when Advice targets such a Skill and finds no items: 2–3 "(הצעה)" lines, then "לשמור? (כן / רק חלק / לא)". Accepted drafts become Commander items as shown.
- **No new read for the whole Playbook.** For hiding, the agent finds base items in `data/playbook.json` with the Read tool, or uses ids from a `readPlaybook` it already ran. The artifact mapping already reads base items that way. "מה יש לי בפלייבוק?" lists the Commander's items from `readCycle`.
- **A text that names a Trainee:** the agent asks for wording without the name before saving. The item carries into the next Cycle and serves every Trainee.

Not done / to raise:

- `copyCommanderScope` (carrying items and hides into the next Cycle) belongs to ticket 26; it is still "Not built yet".
- An accepted draft item is stored as the Commander's, with nothing marking that the agent drafted it. A later "which of my items did I write myself?" can't tell them apart. Adding a field would be cheap if wanted.
- The router's "not in this version" row now only covers briefs and team status. Ticket 25 is editing the same row in parallel, so expect a merge conflict there.

Tests: 220 unit tests after merging ticket 27 (10 new Playbook-item store tests, 1 new CLI test). Eval `evals/playbook.eval.mjs` 5/5 (10 `claude` calls).

Merging ticket 27 (the reviewed base content) retired the seed ids. So the store tests now run on the seed fixture through `openStore({base})`, and `hidePlaybookItem` checks ids against that same injected base. The CLI test and the hide eval use shipped ids (`b-189`, `b-046`). The hide/un-hide eval was re-run on the new content and passed. Eval results: Results:
- "תוסיף לפלייבוק של דיבאג: …" saved nothing until "כן", then one Commander item with the words verbatim, tagged `impl.debugging`.
- Editing ("תשנה את הטיפ שלי … ל: …") kept the id and took the new words; retiring kept the item stored, retired.
- Hiding by description found `b-003`, and un-hiding took `b-012` back out of the hides, each only after "כן".
- A Talk telling of something that worked was recorded, with the reply ending `(הצעה) לשמור בפלייבוק (יכולות דיבאג, טיפ): "ביקשתי שתסביר לי בקול מה הקוד אמור לעשות"? (כן / לא)`. "לא" saved nothing.
