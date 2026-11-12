**Load:** read, record

# Drafts from the dashboard

The Commander's own updates, typed (or dictated) on the dashboard's + button when Claude Code wasn't at hand: `start` → `drafts`, oldest first, each `{id, text, date, at}`. Each is an update like any message, so record it as [log.md](log.md) says, one draft at a time, oldest first.

- One Entry per draft. `text` = the draft's `text` word for word; Evidence is dated by what the draft says, else the draft's `date` (not today).
- log.md's "Ask first" cases apply per draft: ask about that draft (quote its first words), record nothing from it, leave it open, and go on with the others.
- After its `record-entry` succeeds: `close-draft <draft id> <entry id>`. Never close a draft that wasn't recorded.
- A draft that isn't an update (a question, a reminder to yourself): ask what to do with it. Drop it only on the Commander's word: `close-draft <draft id>` with no Entry.

## Reply

Per recorded draft, `טיוטה מ-<DD/MM>:` and then log.md's lines for its Entry. Then any questions, the alert line, and `לביטול: 'בטל'` (it withdraws the last Entry; name another to withdraw that one).
