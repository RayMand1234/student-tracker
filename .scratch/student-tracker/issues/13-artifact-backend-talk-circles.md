# 13: Artifact backend and dashboard Talk circles

**Spec:** `.scratch/student-tracker/spec.md` (Storage; Setup; Dashboard page); tickets 01, 06, 08

**What to build:** The same walking skeleton, now on the real artifact database with a live dashboard. Setup checks the artifact tools first and fails with one clear Hebrew message when they're missing; otherwise it publishes a private, pinned plain-HTML page with `db` + `user` titled "מעקב חניכים · <Cycle>", writes the pointer, and seeds the database. Every other skill connects silently via the pointer, falling back to a title lookup. The Commander opens the dashboard and sees one circle per active Trainee, coloured green → red by days since the last Talk, updating live when a Talk is logged.

**Blocked by:** 11

**Status:** resolved

- [x] Preflight: `Artifact` present and ToolSearch finds `ArtifactData`; on failure one Hebrew message listing causes and fixes (paid plan, `/login` with claude.ai, no API key/Bedrock/Vertex, org policy or `enableArtifact`, `-p` mode)
- [x] The ArtifactData mapping reference implements every operation built so far (paths, `if_version`, batching, `out_dir` for large reads)
- [x] Setup publishes private + pinned, writes `cycles.json` (`{current, archived: []}`) before seeding, seeds with `setup: in-progress` → `done`
- [x] `connect`: pointer first; else title-prefix lookup — one match connects and caches, several ask, none says "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`"
- [ ] `tracker` lists `ArtifactData` in `allowed-tools`; record whether deferred tools are honoured there (listed; honouring NOT verified, see Comments)
- [x] Dashboard page (Hebrew, RTL, follows viewer light/dark) reads `trainees`, `meta/*`, `commander/settings` live; never reads `entries` or `sensitive`
- [x] Main page: one circle per active Trainee with name and days since last Talk, sorted reddest first, colour bar legend; Trainees who left as one grey line; "no Talk yet" deepest red
- [x] The page's pure derivation module holds the circle colour (green at 0, lime at target, amber at yellow threshold, red at threshold + 7, deep red from threshold + 14) with unit tests over settings fixtures

## Comments

**2026-10-30 — implemented** (`skills/setup`, `skills/tracker/references/storage-artifact.md`, `dashboard/`).

- **Dashboard:** `dashboard/page.html` + `dashboard/derive.mjs` are built into `dashboard/index.html` (`npm run build`; a test fails if it is stale). Variant D styling from the prototype. Live, read-only subscriptions to `meta`, `commander/settings`, `trainees`; never `entries`/`sensitive` (test-guarded). The page has no `<title>`: setup passes "מעקב חניכים · <Cycle>" at publish so the title lookup works.
- **Derivation:** `talkColor` / `talkCircles` / `talkScale` / `daysSince`, unit-tested against the prototype's anchor colours. "Threshold" in the anchors is the yellow threshold; the Commander's red setting doesn't move the colours (it is for overdue alerts, ticket 25). When target = yellow (the default) amber wins at that day and there is no lime stop. Text ink is white or black by WCAG contrast, ≥4.5:1 on every day (test-guarded).
- **Visual check:** headless Brave screenshots at 360/400/1280px, light and dark, against a stand-in db (`scripts/preview-dashboard.mjs`). The first published version had circles overflowing at phone width and Latin mono on Hebrew; fixed before republishing.
- **Verified on a real private test artifact** (unpinned, titled "בדיקת דף עיגולי שיחה", sample data; https://claude.ai/artifact/TuAo3Ex1mjTTTLuMyVZ6A2 — safe to delete) by following `storage-artifact.md` literally: publish from the plugin path with `db` + `user`; seed per `createCycle` (incl. `file_path` for the Skill framework); `list trainees` returns cards only; a create on an existing id and a stale pin are both refused as `version_mismatch` (message tells them apart); `recordEntry` steps 2–4; `pending` removed via `__delete__`; queries `status == writing`, `trainees array-contains` + `at >=`, `kind == talk` + `retracted == false`.
- **Evals** (`npm run eval`, real model, `-p`): setup + Talk, resume, and preflight (no artifact tools in `-p` → the causes message, nothing created).

Deviations / open points:
1. **Test backend selection changed:** `STUDENT_TRACKER_DATA` (ticket 11 deviation 2) is gone. A pointer marked `"backend": "local"` selects the local store. Evals own the `--plugin-dir` data dir `~/.claude/plugins/data/student-tracker-inline` (an installed plugin uses a different dir), back up its pointer, and refuse to start if a backup from an interrupted run is left.
2. **The pointer is read with the Read tool**, which will likely prompt the Commander for permission (the plugin data dir is outside the working dir). Tried and dropped: `` !`cat …` `` injection (blocked outside working dirs; aborts the skill) and `Read(${CLAUDE_PLUGIN_DATA}/**)` in `allowed-tools` (not honoured). Revisit in ticket 29 (README: how to allow it once).
3. **`ArtifactData` in `allowed-tools`: honouring not verified** — `-p` has no artifact tools. Check in the ticket 28 smoke test.
4. Setup reads the storage references through `${CLAUDE_PLUGIN_ROOT}/skills/tracker/references/` (a cross-skill path) to keep one source of the mapping.
5. New storage operation `openDashboard` (keeps the Artifact `open` call in the mapping file, out of SKILL.md).
6. `connect` treats "page reachable, `meta/cycle` missing" as `setup: in-progress`, so an interrupted setup resumes instead of publishing a second page.
