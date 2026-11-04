# Store

One store per Cycle, reached only through `student-tracker-store` commands; the backend file below says how to run one. The store keeps every storage rule (ids, times, cards, display-safe checks, alerts, write order), so you pass what the Commander said and reply from what the command returns.

- Payloads go on stdin as plain text in a quoted heredoc (`<<'X' … X`), never JSON.
- A refusal writes nothing and says why. Fix the input (a text it calls not display-safe → reword it, citing nothing sensitive) or ask the Commander, then run it again.
- An archived Cycle (an address in the pointer's `archived`) is read-only: reads take its address; a write to it is refused.

## Every turn

- `start` → `{connect, resumePending, cycle, team}`.
  - `connect`: `{backend, url, cycle, setup}`, plus `archived: true` when the current Cycle is archived. The rest comes only once setup is `done`; `resumePending` not on an archived Cycle.
  - `resumePending`: `{finished: [entry ids]}`, writes an earlier session left half-done, now finished.
  - `cycle`: `{cycle, skills, preset, commander: {settings, hides}, playbook, teams}`.
  - `team`: every card with its `id`, those who left included (`active: false`). Team views count only active Trainees.
- `connect`, `resume-pending`, `read-cycle`, `read-team`: the same parts alone.
- `rebuild-card <tid>` → the card recomputed from its records, when a card looks wrong.

Card: `{name, active, left, status: {value, by, reason}, evalStage, lastTalk, snapshot, items, followups, nextTalk, skills: {<skill id>: {a: [[date, score, author], …], n}}}`. Status values: `good` במסלול, `watch` במעקב, `concern` דורש טיפול.
