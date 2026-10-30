# 28: Real-artifact smoke test

**Spec:** `.scratch/student-tracker/spec.md` (Testing Decisions → manual checklist)

**What to build:** Confidence that the artifact-database mapping behaves like the local test backend. The Commander runs the plugin against a real private artifact and walks the checklist, noting anything that differs.

**Blocked by:** 12, 13, 15, 17, 26

**Status:** resolved

- [x] Publish and seed via setup; dashboard opens pinned and private
- [x] Record a multi-Trainee Entry; dashboard updates live
- [x] Interrupt a write (close the session mid-update); next command finishes it with no duplicates
- [x] Retract an Entry; it disappears from the dashboard, records remain
- [x] Flip a sensitive mark both ways; dashboard never shows the sentence
- [x] Start a second Cycle; settings and Playbook carry over, old one shows the archive banner
- [x] Reconnect from a fresh machine or after reinstall via title lookup
- [x] Note any quota or rate-limit errors seen

## Comments

**2026-10-31 — run by the agent** against two real private artifacts, playing setup and `tracker` on the artifact backend exactly as `storage-artifact.md` maps each operation (the Commander asked for the work to be finished without waiting on them). Fake Trainees only; a scratch pointer, never the real plugin data dir.

Every checklist item passes **at the data level**: publish + seed (private, pinned, `db` + `user`); a three-Trainee Entry (13 records; every card equals a rebuild from its records); an interrupted Entry (Entry + one of two chunks written) finished by the next run's `resumePending` with no duplicate, a deliberate re-create refused; Retraction (records flagged, still stored, the page's `retracted == false` reads drop them, cards fall back); a sensitive flip both ways (no word of the sentence in any document the page reads); a second Cycle (settings, all Playbook items incl. a retired one, the hide and a Commander-added Skill carried over; old Cycle `archived: true` + `archivedAt`); reconnect from a lost pointer by title lookup. No quota or rate-limit errors in ~150 calls (Cycle 1 used 39 of 25,000 documents; batches ≤50). Also run once each: readStatus, takeAlert, recordNextTalk, savePlaybookItem, retirePlaybookItem, hidePlaybookItem, updateSettings, addSkill, setTeam, copyCommanderScope, archiveCycle. Not run: hardDelete, readPlaybook, recordAssessments, updateTrainee, an interrupted setup, and resuming an interrupted retraction or delete.

**Still for the Commander's eyes** (the pages need the claude.ai login, so the agent couldn't render them): Cycle 1 shows the "מחזור בארכיון" banner; circles and cards render; the page repaints by itself after a write; נועה's file shows the marker, not the sentence; the retracted Talk is gone from דני's window. Both test pages (private, unpinned, retitled "בדיקת עשן · student-tracker (אפשר למחוק)" so setup's title lookup never finds them; delete them whenever): Cycle 1 https://claude.ai/artifact/VgQPtR2DsU4VyonhZXerDw (archived; holds every case above), Cycle 2 https://claude.ai/artifact/G1TxpWuB1pEPm7Go9eCZBa.

**Mapping problems found, fixed in the review-fix commit that follows:** a second Cycle set up in the same conversation republished the first Cycle's page (same file path → same URL); `retractEntry` / `hardDelete` step 2 cost ~42 gets per Trainee (now a query per subcollection by `entry`); a reconnect from a lost pointer forgot the archived Cycles; plus small ones (multi-Trainee `flipSensitive` lookup, `+HH:MM` offsets, `out_dir` location, card shape in `createCycle`, "general" tags in `copyCommanderScope`, tie-breaks on `name`/`left`).
