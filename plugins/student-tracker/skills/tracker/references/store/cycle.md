# Store: Cycle setup

Setup only, in this order; each is safe to run again after an interrupted setup.

- `create-cycle` → `{url, trainees: [{id, name}]}`. Payload: `commander: <name>`, `cycle: <name>`, `trainee: <name>` (repeat); optional `role:`, `start: YYYY-MM-DD`, `target:`, `yellow:`, `red:`, and `previous: <address>` for a new Cycle after the current one. Leaves the Cycle `in-progress`. Values not given come from what is stored, or from the previous Cycle.
- `copy-commander-scope <previous address>` → `{settings, skills, playbook, hidden}`: the Commander's settings, Playbook items, hides and the Skills those items need, copied into the new Cycle.
- `archive-cycle <previous address>` → its Cycle: archived, read-only from now on; its page stays.
- `finish-setup` → the Cycle, `setup: done`. The last write.

```
student-tracker-store … create-cycle <<'CYCLE'
commander: רז
role: מפ"צ
cycle: הצהובים
target: 7
trainee: נועה
trainee: דני
CYCLE
```
