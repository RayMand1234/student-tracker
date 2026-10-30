# 23: Base Playbook format and Advice

**Spec:** `.scratch/student-tracker/spec.md` (Briefs, status and Advice stories 80–82; Playbook stories 84, 90; Domain rules → Advice build); ticket 04

**What to build:** The Commander asks "איך לעזור לנועה בדיבאג?" and gets 2–3 suggestions marked "(הצעה)", grounded in that Trainee's Evidence. Base Playbook items ship as plugin data with stable ids; Advice targets the lowest or declining Skills (or a named focus), picks band-fitting items, prefers Commander items, skips what was tried without effect, and cites Evidence. Whenever a Trainee's records change, the agent also refreshes 2–3 display-safe `nextTalk` questions on the card.

**Blocked by:** 16

**Status:** resolved

- [x] Base item format: stable never-reused id, kind (sign | tip | exercise | Talk question), text, Skill ids or "general", optional band (low 1–2 | mid 3 | high 4–5), origin `base`
- [x] A small seed set (a few Skills + "general") to exercise the flow; full content is ticket 27
- [x] Consistency check: unique ids, every Skill tag exists in the Skill framework, valid bands, preset aliases unique
- [x] Advice is never stored; it becomes a record only when accepted as an improve/keep item or Follow-up (confirmed)
- [x] Unrated Skills get only untagged items
- [x] `nextTalk: {questions, at}` rewritten in the same chunk as any card update, marked "הצעה", display-safe
- [x] Hides over base ids that no longer ship are ignored

## Comments

**2026-10-30 — implemented** (`data/playbook.json`, `lib/playbook.mjs`, `lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `skills/tracker/SKILL.md`, `skills/tracker/references/{advice,log,assess,storage,storage-local,storage-artifact}.md`, `test/playbook.test.mjs`, `test/advice.test.mjs`, `test/cli.test.mjs`, `evals/advice.eval.mjs`). Built on branch `ticket-23-playbook-advice`, based on `integration/v1`.

**The shipped Playbook is a seed set, not the base Playbook.** `data/playbook.json` holds 17 items on four Skills (`impl.debugging`, `inter.communication`, `learn.independence`, one tagged to `inter.helping-others` too) plus "general", all four kinds, with `"seed": true` and a note saying so. It is there to run the item format, loader, check and Advice end to end. Ticket 27 (ready-for-human) replaces it with content the Commander reviews one Stage batch at a time, and drops the `seed` flag. A test pins the flag, so the swap is a deliberate step.

Decisions taken while building (agent-decided, veto any):

- **Item format:** `{id, origin: "base", kind: sign | tip | exercise | talk-question, skills: [Skill ids] | ["general"], band?: low | mid | high, text}`. Ids are `b-<number>`. "Never reused" is enforced by a `retired` list in the file: an item taken out leaves its id there, and the check refuses any item that reuses one. A general item has no band, since it has no Rating to fit.
- **Consistency check** (`checkPlaybook` in `lib/playbook.mjs`, run by the tests and on every load): ids unique, well-formed and not retired; every Skill tag exists in the framework; "general" stands alone; known kind and band; non-empty text; origin `base`; no unknown fields. The preset-alias check already existed in `data.test.mjs`.
- **`readPlaybook(tid, skills?)`** is a new storage read (CLI `read-playbook <tid> [<skill id>…]`; on the artifact backend the agent reads `${CLAUDE_PLUGIN_ROOT}/data/playbook.json` plus `commander/hides`, `playbook/`, the card). It merges the Commander's own items (not retired) first, then the base items minus hides. A hide on an id that no longer ships is never matched, so it is ignored. It returns `targets` and `general`. Targets are the focus Skills when the Commander names any, otherwise the declining (↓) Skills and then the lowest-rated, 3 at most, skipping archived Skills. Each target comes with its Rating, its Trend (from `derive.mjs`'s `rating`, the same rule as the page) and the items whose band fits. An unrated Skill gets only untagged items. Picking targets and bands is code so it can be tested. Skipping what was already tried, and rewriting each suggestion to the Trainee's Evidence, stays with the agent (`advice.md`).
- **Advice is never stored.** `advice.md` asks for 2–3 lines marked "(הצעה)", each citing Evidence, and records nothing. An accepted suggestion goes through `log.md`. As an improve item it is an agent item (`by: agent`, the agent's words), taken from an `improve-keep` Evidence whose excerpt is the acceptance message. A Commander item applies when the Commander's message gives its own wording.
- **`nextTalk` is now a record:** a `changes` record `{type: "nextTalk", questions, by: "agent"}`, and the card shows the latest one. It used to carry over on the card; now `rebuildCard` restores it and Retraction falls back to the questions before. It is written with every Entry, per Trainee the Entry has Evidence about, and with a re-rate or accepted proposal (`recordAssessments(..., {nextTalk})`, id `c-…`). It is not written with a Commander Status, roster change or flip: those add no Evidence for the questions to rest on. The store refuses fewer than 2 or more than 3 questions, empty or repeated ones, and any question that repeats a sensitive part of this Entry **or a live sensitive record already stored for that Trainee**. That second check is stricter than the Snapshot check from ticket 19, because the questions draw on 6 weeks of records. The "הצעה" label is the dashboard's (ticket 21 already shows it). Questions never appear on the confirmation line. CLI block: `--- next-talk <tid>` with one question per line, in `record-entry` and `record-assessments`.
- The router now sends advice requests and acceptances to `advice.md`. Briefs, team status and adding to or hiding from the Playbook still answer "עוד לא נתמך".

Not done / to raise:

- **Follow-ups need the Commander's words.** When the Commander accepts a suggestion "for the next Talk" by pointing at it ("כן, את הראשונה לשיחה הבאה"), the agent asks once what to record, because a Follow-up has to be word-for-word. Accepting it as an improve item needs no question.
- **An accepted suggestion shows as an agent item**, marked הצעה on the card, because the words are the agent's. If the Commander would rather it show as theirs, the store would need a third kind of author ("accepted").
- `flipSensitive` doesn't re-check existing Snapshots or next-Talk questions against a record that just became sensitive. The next Entry rewrites the questions; this is the same gap as the Snapshot one from ticket 19.
- `savePlaybookItem` / `hidePlaybookItem` / `copyCommanderScope` (ticket 24) and briefs (ticket 25) are not built. The tests seed `playbook/` and `commander/hides` directly, in the shape `readPlaybook` assumes (`retired` falsy = live). Ticket 24 should keep that shape or update `pickPlaybook`.

Tests: 195 unit tests (5 new Playbook data/check tests, 10 new Advice/next-Talk store tests, 1 new CLI test). Eval `evals/advice.eval.mjs` 2/2. "איך לעזור לנועה בדיבאג?" gave 3 "(הצעה)" lines citing her Evidence; it skipped "sit with Dani" because her record shows that was already tried, and stored nothing. "כן, תוסיף את הראשונה כנקודה לשיפור" became one improve item. A Talk with a sensitive family sentence gave the Trainee 2–3 next-Talk questions with none of the sensitive words, and no questions for the other Trainee.
