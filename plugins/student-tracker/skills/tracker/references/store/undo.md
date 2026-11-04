# Store: retract, delete, sensitive flip

- `retract-entry [<entry id>]` → `{entry, trainees, retracted: [ids]}`. The named Entry, or the last one written. Flags it and everything cut from it as withdrawn and rebuilds the cards; nothing is deleted. A Follow-up it closed reopens; Ratings, Status, stage and items fall back to the earlier ones.
- `hard-delete <entry id>` → `{entry, trainees, deleted: [ids]}`. Deletes the Entry and everything cut from it, for good. Only on the Commander's explicit, confirmed request.
- `flip-sensitive <evidence id> [--category <category>]` → `{id, now: "public"|"sensitive", moved: [ids], repeats?}`. Moves one Evidence, with its Follow-ups and items, into or out of the sensitive records; into them needs `--category` (a category, or `other`). Takes an Evidence id only (flip a Follow-up's or item's Evidence). Marking: `repeats: [{what, text}]` lists what the card still shows that repeats it (`snapshot`, `nextTalk`, a `status`/`left` reason, an `item`).
