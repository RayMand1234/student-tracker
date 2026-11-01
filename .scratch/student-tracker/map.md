# Map: student-tracker plugin

Labels: wayfinder:map
Created: 2026-10-29

## Destination

A spec for `student-tracker`, a Claude Code plugin that any Commander in the Course family installs and runs `/student-tracker:setup`; it asks about their Trainees, Talk cadence and extra info, then gives them Talk logging, Skill Ratings across the four Stages, a live stats dashboard artifact, Playbook advice and pre-Talk briefs, all backed by persistent memory in the artifact's database.

## Notes

- Domain: mentoring Trainees in a 21-week Fullstack course. Hebrew-first UI. Vocabulary in `GLOSSARY.md`; Stage/Skill list in `docs/skill-framework.md`.
- Every session: call the Skill tool for `grilling` and `domain-modeling`; update `GLOSSARY.md` inline; ADRs in `docs/adr/`.
- Reference only, not to preserve: the Commander's earlier claude.ai skill, copied to `docs/reference/trainee-mentoring/`. Borrow rules where they fit (word-for-word Evidence, agent output marked as assessment/suggestion, sensitive details never shown on the dashboard, good/watch/concern status, evaluation process, pre-Talk brief shape, test catalog).
- Standing decisions from charting:
  - Plan, don't build: the map ends at the spec.
  - v1 targets Claude Code only; design stays portable so a later export to other agents' plugin formats is cheap.
  - Storage = the Cycle's Claude artifact database, behind one swappable layer ([ADR 0001](../../docs/adr/0001-artifact-database-as-the-brain.md)). Cloud storage of sensitive details is approved by the Commander; sensitive details are stored but never displayed on the dashboard; artifact stays private.
  - One Commander per install, one artifact per Cycle; re-run setup for a new Cycle, old artifact archived.
  - Ratings: 1–5 per Skill, dark red → vibrant green, gray = no evidence. Agent proposes with linked Evidence, marked as assessment; Commander's explicit Rating wins. Same Skill name in two Stages = two Skills. Interpersonal group tracked alongside the Stages.
  - v1 tracks all Evidence kinds from the reference skill, not only Talks.
  - Advice = shipped base Playbook per Skill + Commander's own tips, tailored per Trainee.
  - Distribution: public GitHub marketplace repo with no Trainee data in it.
- **Question budget (Commander, 2026-10-29):** the agent decides technical questions itself (storage layout, command names, recovery logic, formats) and asks the Commander only about taste, the Trainee experience, or anything hard to undo. Each resolution lists the decisions the agent made under "Agent-decided (veto any)" so the Commander can overturn them later. Grilling rounds stay short; once the frontier is clear, hand off to `/mattpocock-skills:to-spec`.
- No git repo yet, so research findings go to `.scratch/student-tracker/research/<name>.md` instead of `research/<name>` branches.

## Decisions so far

- [Can a Claude Code plugin create and drive a Cycle's artifact database?](issues/01-artifact-runtime-from-claude-code.md): Yes, via a private plain-HTML page with `db`+`user` (not the Dashboard type), driven by `ArtifactData` as the Commander; needs a paid plan + claude.ai `/login`, setup must check the tools exist, URL kept in `${CLAUDE_PLUGIN_DATA}`, sensitive data hidden only by page code (own collection).
- [How is a Claude Code plugin packaged, namespaced, configured and distributed?](issues/02-claude-code-plugin-packaging.md): Skills-only plugin (`skills/setup/SKILL.md` → `/student-tracker:setup`) in one public GitHub repo with a relative-path `marketplace.json` entry, installed at user scope; no plugin-local store syncs across machines (`userConfig`/`pluginConfigs` and `${CLAUDE_PLUGIN_DATA}` are per-machine and deleted on uninstall), so Commander settings live in the artifact DB and the machine caches only the URL; third-party auto-update is off by default; keep SKILL.md to the agentskills.io fields for portability.
- [What is the domain model of Trainees, Evidence and Ratings?](issues/03-domain-model-evidence-and-ratings.md): A whole raw Entry is split into immutable, word-for-word Evidence (one Trainee each, 11 kinds, sensitive flag in 6 categories); immutable Assessments (agent/Commander/Trainee-self) back a derived Rating; Follow-ups, improve/keep items, Status changes, Project teams and a course-preset catalog (Subjects, Tests + aliases, Schedule) complete it; the Trainee holds only current state.
- [What does the Playbook look like and where does its base content come from?](issues/04-playbook-shape-and-seed.md): Flat Playbook items (sign · tip · exercise · Talk question) tagged to Skills or "general" with an optional level band; base agent-drafted, Commander-reviewed per Stage, shipped as plugin files; Commander items live in the DB, owned by the Commander across Cycles, added only on confirmation; Advice is ephemeral "(הצעה)", 2–3 picks grounded in Evidence, shown in briefs, direct asks and team status; the dashboard shows only suggested next-Talk questions (changed by the dashboard ticket below).
- [How does the agent turn Evidence into a 1–5 Rating?](issues/05-rating-derivation-rules.md): One shared 1–5 scale; the agent assesses only Skills the Evidence speaks to, judging holistically, recorded without confirmation; Rating = latest counting Assessment (whole number), Commander overrides sticky with agent proposals "(הצעה)"; test scores and self-assessments never count (self gap ≥2 → מודעות עצמית Assessment); Trend vs 4 weeks ago, stale after 6 weeks, no decay; band edges unchanged.
- [What does `/student-tracker:setup` ask, and what does it create?](issues/06-setup-flow.md): Preflight for the artifact tools first, then a title lookup ("מעקב חניכים · <Cycle>") to connect or resume; one batched Hebrew question message (Commander name and Cycle mandatory, the rest defaulted or added later), a confirmation summary, then publish a pinned private page, write the URL pointer, seed with a setup state, and a Hebrew hand-off; setup-time Trainee info is an ordinary Entry, duplicate first names get a label, settings edits go through chat.
- [Which slash commands and auto-triggered skills does the plugin expose?](issues/07-command-and-skill-surface.md): One auto-triggering `tracker` skill (router + per-capability `references/`) handles all free text; user-only `setup` plus shortcuts `brief`, `status`, `dashboard`; Evidence is written without asking and undone by "בטל" (Retraction: kept, stops counting); roster and settings changes are confirmed first; no hooks; skills only, export adds a `student-tracker-` prefix.
- [How does the domain model map onto the artifact database, behind what storage interface?](issues/09-storage-layer-mapping.md): One doc per immutable record in per-Trainee subcollections, plus a derived Trainee card (current state + counting Assessments per Skill) that the page and agent read, computing Rating/Trend/stale at read time ([ADR 0002](../../docs/adr/0002-derived-trainee-card-and-commander-copy-forward.md)); Entries written in per-Trainee atomic chunks with a `writing`→`done` resume mark; Retraction = `retracted` flag; raw Entries and sensitive records in collections the page never reads; Commander-scoped data copied forward to each new Cycle; skills call one backend-neutral `storage.md` interface.
- [How should the dashboard artifact look and behave?](issues/08-dashboard-prototype.md): Main page = Talk circles colored green→red by days since the last Talk; a click opens a Trainee window (Snapshot, Skills, details, open Follow-ups + suggested next-Talk questions stored on the card as `nextTalk`); "לתיק המלא" opens the Trainee file with growth charts (per Stage vs team, replayed from the card) and 4-week movers; no team-wide view on the dashboard, team questions stay in chat.
- [What do the tracker's chat replies look like?](issues/10-chat-output-formats.md): brief = short labelled sections in a fixed order (מה השתנה, לבדוק, מיקוד (הצעה), לחזק, שאלות פתיחה = the dashboard's `nextTalk`, אישי); team status = four lists (צריכים שיחה, בירידה, חולשה משותפת, פעולה לצוות) plus "בסדר"; alerts ride other replies as one line before the Retraction line, each at most once a day (remembered in the store).

## Spec

- [Spec: `student-tracker` Claude Code plugin (v1)](spec.md) (ready-for-agent, 2026-10-29). It closes the git-free install, Course preset, Cycle lifecycle and portability fog below as agent-decided (veto any). Ticket 10 resolved 2026-10-30.
- Build tickets 11–29 in `issues/` (2026-10-30): tracer bullets, frontier starts at 11; 27 and 28 are ready-for-human; ticket 10 resolved 2026-10-30, so 25 waits only on its build blockers.

## Not yet specified

- **Git-free install path**: whether a Commander without `git` can install the plugin (the setup preflight and its failure message are settled in "What does `/student-tracker:setup` ask, and what does it create?").
- **Course preset**: which parts of the reference course structure and test catalog ship as the default, and how setup lets a Commander override them.
- **Cycle lifecycle**: archiving an old Cycle's artifact, starting a new one, carrying over the Commander-owned Playbook items, base-item hides and Commander settings (all owned by the Commander, not the Cycle). Setup's "new Cycle" branch is the entry point; Commander-scoped data is copied forward with `copyCommanderScope` ("How does the domain model map onto the artifact database, behind what storage interface?"), so what remains is archiving, the pointer's `archived` list and what the Commander sees.
- **Portability seam**: what to keep agent-neutral now (prompts; the skill layout and naming are settled by "Which slash commands and auto-triggered skills does the plugin expose?", and the storage interface by "How does the domain model map onto the artifact database, behind what storage interface?") so the later export stays cheap, without designing the export itself.

## Out of scope

- Writing updates from the phone (viewing via claude.ai is incidental): the Commander ruled it out of v1.
- Exporting to Codex CLI, Gemini CLI, Cursor, Copilot CLI, OpenCode: a later effort; v1 is Claude Code only.
- Sharing between Commanders or aggregating across Commanders: one private instance per Commander.
- Non-Claude storage backends: ADR 0001 keeps v1 on the artifact database.
