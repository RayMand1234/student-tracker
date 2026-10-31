# Artifact backend: retract, delete, sensitive flip

## `retractEntry(eid?)`

Pick: named → `get` `entries/<eid>` (missing or `deletion` set → refuse "no Entry <eid>"); else `query` `entries` `order_by: at desc`, `limit: 5`, first without `deletion` (all have it → larger limit; none → refuse "nothing has been recorded yet"; same `at` → higher id). Still `status: "writing"` → finish it first (`resumePending` for it).

1. **Mark.** `retraction: "done"` → refuse "Entry <eid> is already retracted". `"writing"` → go to 2. Else `update` `{retracted: {at: Now}, retraction: "writing"}` with its version; on a conflict `get` and decide again.
2. **One chunk per Trainee** in `trainees`: `query` `trainees/<tid>/evidence`, `…/followups`, `…/assessments`, `…/items`, `…/changes` where `entry == eid`, and `sensitive` where `entry == eid` and `trainee == tid` (a flip may have moved it). Keep `retracted: false` ones. None → `rebuildCard(tid)`, next. Else `get` the card (version `v`), build it as `rebuildCard` would without them, one `batch`: `update` each `{retracted: true}` with its `if_version`, `set` the card with `if_version: v`. On a conflict start this chunk over.
3. **Done.** `update` `{retraction: "done"}` with its version (conflict → `get`; stop if done).

Return `{entry, trainees, retracted: children}`.

## `hardDelete(eid)`

Refuse without id; `get` `entries/<eid>` (missing or `deletion` set → refuse "no Entry <eid>"); finish it first if `status: "writing"`.
1. `update` `{deletion: "writing"}` with its version.
2. Chunks as retract step 2, but every record among `children` (retracted or not), each `delete` with its `if_version`, card built without them.
3. `delete` `entries/<eid>` with its version.

Return `{entry, trainees, deleted: children}`.

## `flipSensitive(id, category?)`

Find it: `get` `sensitive/<id>` (its `trainee`); else `get` `entries/<id up to last -n>` and `get` `trainees/<tid>/evidence/<id>` for each `tid` in `trainees`. Refuse a Follow-up or item (`record` followup/item, or found under `followups/`/`items/`), `retracted` not `false`, not found, or moving in without `category`. Its Entry still `writing` → finish that Entry first, then start again.

1. Its Follow-ups and items: `query` `sensitive` where `from == id` (moving out), or `trainees/<tid>/followups` and `…/items` where `from == id` (moving in). Note versions.
2. New data: out → drop `record`, `category`; in → Evidence gets `record: "evidence"` + `category`, Follow-ups `record: "followup"`, items `record: "item"`.
3. `get` the card (version `v`), build it as `rebuildCard` would with the new places.
4. One `batch`: `delete` each old doc with its `if_version`, create each new one, `set` the card with `if_version: v`. Conflict → start over.
5. Moving in: display-safe check (stored sensitive records, this one included) on the new card's `snapshot.text`, each `nextTalk` question, `status.reason`, `left.reason`, each `by: "agent"` item text; failures → `repeats` `{what, text}`.

Return `{id, now, moved}` (+`repeats` if any).
