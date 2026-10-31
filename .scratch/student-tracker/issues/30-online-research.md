# 30: Online research on a Trainee's situation

**Spec:** `.scratch/student-tracker/spec.md` (Advice and the Playbook; Further Notes → privacy). Added after v1 at the Commander's request.

**What to build:** A way to ask the agent to research a Trainee's situation online. It reads what is on record, forms one to three working hypotheses (learning and ways of working, never a clinical label), searches the web for good sources, reads the best of them, and gives 2–3 suggestions that join a source's finding to the Trainee's Evidence. Like Advice, nothing is stored unless the Commander accepts a suggestion. Nothing about the Trainee goes to the web.

**Blocked by:** 23

**Status:** resolved

- [x] `tracker` routes research requests ("תחקור את המצב של נועה", "תמצא מאמרים על…", "מה אומר המחקר על…") to `references/research.md`, and lists `WebSearch` and `WebFetch` in `allowed-tools`
- [x] `/student-tracker:research <שם> [נושא]`: a user-only shortcut that hands off to `tracker`
- [x] Privacy rule first: queries, built URLs and fetch prompts carry only generic words; no name, Commander or Cycle name, excerpt or sensitive content; a Trainee's personal situation is never researched
- [x] Hypotheses cite Evidence and say what would tell them apart; sources are fetched before they are cited, and never invented; the reply shows the queries it ran
- [x] Accepting a suggestion: improve item or Follow-up as in Advice; into the Playbook only in the Commander's own words, confirmed
- [x] Fallback when search finds nothing usable or is unavailable: hypotheses, then Playbook Advice
- [x] Unit tests: skill surface, routing and allowed-tools, agent-neutral audit; eval `research.eval.mjs` asserts every web call is free of names and sensitive words, and nothing is stored

## Comments

- 2026-10-31 — Commander: a research run took over 5 minutes and many tokens. Eval baseline 125s / $0.85 / 19 turns. Trimmed `research.md`: no `readPlaybook` or advice.md up front (only in the fallback), no alert check (a read, like the brief), 2–3 queries and 2–3 fetches each sent in one message, HTML pages over `.pdf` links (a PDF came back unreadable and cost ~50s), one replacement fetch round only when nothing was citable. After: $0.72–0.77, 17 turns; wall time 101–214s, dominated by page-fetch latency (one page took 85s) and model think time. Artifact mode saves more than the eval shows: `readPlaybook` and `takeAlert` are several `ArtifactData` round trips each. Remaining fixed cost is shared by every request: `storage.md` (39K chars) is read on every run.
