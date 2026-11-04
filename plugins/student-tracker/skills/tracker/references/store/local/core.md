# Local backend

Test backend: JSON files on this machine. Run each command directly; it does every read and write itself:

```
student-tracker-store --data "<plugin data dir>" <command> [args] <<'X'
<payload>
X
```

Success prints the result as JSON; a refusal exits 1 with the reason on stderr.

- Start: the one `start` command, in the same message as the route's `boot`.
- No current Cycle: `connect` looks for this machine's Cycles; several are refused with their names, to ask which.
- An archived Cycle: `--cycle "<address>"` before the command (reads only).
- Dashboard, unpinning: there is no page in a test setup; say so in one line.
