# 26: Cycle lifecycle — new Cycle, carry-over, archive

**Spec:** `.scratch/student-tracker/spec.md` (Cycle lifecycle; stories 15–18); ADR 0002

**What to build:** A Commander starting their next Cycle keeps everything that belongs to them. Choosing "new Cycle" in setup prefills settings from the previous Cycle ("ממשיך עם: … — לשנות?"), publishes and seeds the new artifact, copies settings, Playbook items and hides forward, archives the old Cycle (pointer `archived` list, `archived` flag, read-only banner on its dashboard), and offers once to unpin it. The Commander can still ask about an archived Cycle in chat; `tracker` refuses writes to it.

**Blocked by:** 18, 20, 24

**Status:** resolved

- [x] `copyCommanderScope(fromUrl)` copies `commander/*` and `playbook/*` into the new Cycle, idempotently
- [x] Old URL moves to `archived` in the pointer; old `meta/cycle.archived = true`; dashboard shows "מחזור בארכיון"
- [x] Unpin only on the Commander's yes
- [x] Writes targeting an archived Cycle are refused with a pointer to the current one
- [x] "מה היה עם דני במחזור הקודם?" reads the archived Cycle
- [x] Evals on the local backend cover the full new-Cycle path including an interruption between publish and archive

## Comments

**2026-10-30 — implemented** (`lib/store.mjs`, `lib/payload.mjs`, `lib/cli.mjs`, `dashboard/page.html` (+ rebuilt `index.html`), `scripts/preview-dashboard.mjs`, `skills/setup/SKILL.md`, `skills/tracker/SKILL.md`, `skills/tracker/references/{recall,storage,storage-local,storage-artifact}.md`, `test/cycle-lifecycle.test.mjs`, `test/cli.test.mjs`, `test/dashboard-page.test.mjs`, `evals/lifecycle.eval.mjs`, `evals/harness.mjs`). Built on branch `ticket-26-cycle-lifecycle` off `integration/v1`.

What setup does now on "מחזור חדש": reads the current (previous) Cycle first, asks one batched message that opens with "מחזור חדש. ממשיך עם: <name>, <role>, שיחה כל N ימים (…), <n> פריטים שלך בפלייבוק, <m> פריטי בסיס שהסתרת — לשנות?" and asks only for the new Cycle's name (mandatory), start, Trainees, teams/Skills and the course check; the summary adds what carries over and that the previous Cycle goes to the archive. On the yes: publish (artifact) → pointer `{current: new, archived: [..., previous]}` → `createCycle({..., previous})` → setup's usual changes → `copyCommanderScope(previous)` → `archiveCycle(previous)` → `finishSetup`. On the artifact backend the hand-off ends with one unpin question; only a clear yes unpins.

Decisions taken while building (agent-decided, veto any):

- **The previous address moves into the pointer's `archived` when the new Cycle becomes `current`, not after the copy** (the spec's order puts it last). The pointer holds only `{current, archived}` and must name the new page before seeding (ticket 06), so writing both in one pointer write is the only way the previous address is never lost if setup stops between publish and archive. "Archived" in the pointer = no longer current; `meta/cycle.archived = true` (set by `archiveCycle`, after the copy) = read-only. A resumed setup finds its previous Cycle from `meta/cycle.previous` (new field) or, with nothing seeded yet, from the `archived` address whose Cycle isn't marked yet.
- **`meta/cycle.previous`** records the address a Cycle follows. "המחזור הקודם" in chat = the current Cycle's `previous`; older ones are in `archived` by name.
- **New operation `archiveCycle(url)`** (storage.md, Setup section, next to `copyCommanderScope`): adds the address to `archived` if missing and sets `archived: true, archivedAt`. Idempotent; refuses the current Cycle.
- **`copyCommanderScope` semantics:** Playbook items (retired ones too) copied with the same ids, never overwriting one already there; hides merged; `commander/settings` copied only when the new Cycle has none, because setup seeds them from the prefilled answers and a "לשנות" must win. `createCycle` with `previous` also defaults role and Talk values to the previous Cycle's, so the carry-over holds even if the agent passes only the name. Setup-only: refused once the new Cycle's setup is done (a later re-copy would re-hide what the Commander un-hid).
- **Commander-added Skills travel with the items tagged to them.** Without this, an item tagged to `impl.c-xxxx` would never surface in Advice and couldn't be edited (`ownItem` refuses an unknown Skill). The Skill joins the same group with the same id and name; if the group already has a Skill of that name, the item is retagged to it.
- **Reading an archived Cycle:** the reads take an optional `cycle` (an address that must be `current` or in `archived`); CLI `--cycle <address>`. Every write on a store that is not `current`, or that is marked archived, is refused in the store with "המחזור <name> בארכיון — אפשר רק לקרוא ממנו. עדכונים נרשמים במחזור הנוכחי, <current>." `connect` returns `archived: true` if the current Cycle itself is marked (a hand-restored pointer), and the tracker preamble then answers reads only. Lost-pointer lookups skip Cycles marked archived (local adopt; the artifact title lookup `get`s each candidate's `meta/cycle` when there are several).
- **Dashboard:** a dashed, muted "מחזור בארכיון · לקריאה בלבד · כפי שהיה ב-DD/MM. עדכונים חדשים נרשמים במחזור הנוכחי." banner above the circles and across the top of the Trainee file. An archived page is also frozen on its archive day: Talk circles, Trends, stale and growth lines compute "today" as `archivedAt`'s date (otherwise every circle turns deep red after the Cycle ends). Checked light/dark at 1280px and at 390/360px; the prototype has no archived state, so the banner follows the page's existing muted notes.
- No preset carry-over: the new Cycle gets the shipped Course preset, as the spec says (the course check in the batched question is where differences go again).

Not done / to raise:

- Unpinning is artifact-only and can't run in an eval (no page on the local backend); it belongs on ticket 28's smoke checklist with copy and archive against two real artifacts.
- A Commander who changed the Course preset last Cycle repeats those changes in the new Cycle's course check. Carrying the previous Cycle's preset copy forward would be a one-line change in `createCycle` if wanted.
- The model sometimes writes "מההצהובים" (doubles the ה) when it prefixes מ- to a Cycle name; the template says "ממשיך מ-<previous>".

Tests: 237 unit tests (15 new in `test/cycle-lifecycle.test.mjs`: the new store and pointer move, settings prefill and override, refusal without `previous`, resume after an interruption, copy contents and idempotence, added Skills travelling, copy/archive refusals, the whole path, reading an archived Cycle, every write refused on it, a pointer naming an archived Cycle, lost-pointer adopt; 1 new CLI test; 1 dashboard-page check). Eval `evals/lifecycle.eval.mjs` 3/3 (8 `claude` calls): the full new-Cycle conversation (prefill shown, nothing changes before the yes, then carried over and archived); a setup interrupted after `createCycle` and before copy/archive is finished on the next run without a third store; "מה היה עם דני במחזור הקודם?" answers from the archived Cycle, and an update aimed at it is refused with nothing written anywhere.
