# Claude artifact database is the brain, behind one storage layer

All Trainee data for a Cycle lives in the database of the Cycle's dashboard artifact on claude.ai, not in local files, so the Commander can reach it from any device and the dashboard reads live from the same place the agent writes. This ties v1 to Claude; to keep a later export to other agents (Codex, Gemini CLI, …) affordable, the plugin talks to storage only through one isolated layer that can be swapped for a neutral store.

## Considered Options

- **Local plain files**: private and agent-agnostic, but unreachable from other devices. Rejected by the Commander.
- **Neutral cloud store (Google Sheets / private GitHub repo / Supabase) with the artifact as a view**: portable from day one, but adds accounts, credentials and a second system for v1.
