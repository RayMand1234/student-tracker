# Dashboard drafts: the page's one write

A Commander away from Claude Code (on a phone) had no way to log an update, although the dashboard already opens there. So the dashboard gets a + button that saves a Draft to `inbox/<id>` in the Cycle's database: `{text, at, date, status: "new", source: "dashboard"}`, typed, or dictated where the viewer's browser offers the `dictation` capability. The page writes nothing else. The next tracker turn sees the waiting Drafts in `start` and offers to record them. Each becomes an ordinary Entry, cut and checked by the same rules as any message, and `close-draft` then closes the Draft with that Entry's id.

## Considered Options

- **The page records the Entry itself**: the cutting into Evidence, the sensitive parts and the display-safe checks live in the agent and the store, not in the page. Rejected.
- **The page asks Claude to record it (`sample`)**: same problem, plus a second copy of the logging rules in page code. Rejected.
- **Record Drafts automatically at the start of any turn**: writes the Commander didn't ask for in that turn, and log.md's ask-first cases would interrupt an unrelated request. Rejected in favour of a one-line offer.

## Consequences

- The dashboard is no longer read-only. Its test now allows writes to `inbox/` only.
- A Draft keeps its words after it is closed. Retracting the Entry made from it doesn't reopen it.
- Pages published before this change have no button. Republishing an existing Cycle's page from the new `index.html`, with the `dictation` capability added, gives it one; its data stays.
- Dictation is offered only in Chromium browser tabs and the Claude desktop app. In Safari and the Claude mobile apps, the phone keyboard's own microphone fills the same box.
