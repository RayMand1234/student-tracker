# 27: Write and review base Playbook content

**Spec:** `.scratch/student-tracker/spec.md` (Packaging → base Playbook); ticket 04 decision 4

**What to build:** The shipped base Playbook, so Advice is useful from day one. The agent drafts Hebrew items in one batch per Stage plus the Interpersonal group and a small "general" set (per Skill roughly: 2 signs — one weak, one strong — 2–3 tips, 1–2 exercises, 2 Talk questions; thin Skills may have fewer). The Commander reviews and approves each batch before it ships.

**Blocked by:** 23

**Status:** resolved

- [x] Five batches drafted (four Stages + Interpersonal group) plus "general"
- [x] The Commander has reviewed and approved each batch
- [x] All items pass the consistency check from ticket 23

## Comments

**2026-10-30 — drafted, reviewed, shipped** (`data/playbook.json`, `test/playbook.test.mjs`, `test/advice.test.mjs`, `test/fixtures/playbook-seed.json`, `lib/store.mjs`).

- **Drafted** by the agent in six batches, from the Skill framework, decision ticket 04 and the reference course notes: למידה ותאוריה 69, הבנת הבעיה 46, תכנון הקוד 45, מימוש בקוד 63, בין-אישי 45, כללי 14 (282 items). Each Skill has a weak (`low`) and a strong (`high`) sign, 2–3 tips, 1–2 exercises and 2 Talk questions; same-named Skills (סדר וארגון ×3, תשומת לב לפרטים ×2) are written to their Stage. A few items serve two Skills.
- **Reviewed** by the Commander on a review page (`.scratch/student-tracker/prototypes/playbook-review/`, published privately at https://claude.ai/artifact/4txkenEdf18VLqPgjcL3pK): every item could be dropped or reworded, with a note per batch. All six batches approved on 2026-10-30, with no drops, rewordings or notes.
- **Shipped** in ticket 23's format: ids `b-018`…`b-299` in batch order; `question` → `talk-question`; no `band` key when an item fits any level; the seed set's ids `b-001`…`b-017` moved to `retired`, so they never name another text. The `seed` flag is gone.

Agent-decided (veto any):
- Three format-only fixes the consistency check asked for, wording untouched: two general items lost their band (`b-288` was `low`, `b-293` `high`; a general item has no Rating to fit, and the text already says when it applies), and `b-294` (the gap after a רמ"ת) is tagged to מודעות עצמית only, since "general" can't stand with a Skill.
- The advice tests now run on the old seed set as a fixture (`openStore({base})`, like `now` and `interrupt`), so they pin the pick rule rather than the shipped content; the content has its own test (every Skill has a weak and a strong sign, tips and two Talk questions; a general set; seed ids retired).

Tests: 209 unit tests.
