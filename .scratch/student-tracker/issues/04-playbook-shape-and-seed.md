# What does the Playbook look like and where does its base content come from?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Commander (claimed 2026-10-29)
Blocked by:

## Question

For each Skill in `docs/skill-framework.md`, what does a Playbook entry contain (signs of weakness, tips, exercises, Talk questions, per-Rating guidance?), who authors the shipped base (Commander, agent-drafted then reviewed, unit staff), how a Commander adds their own tips during normal use, and how the agent combines Playbook + a Trainee's history into advice. Decide the shape and the authoring process, not the content itself.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, 13 questions, all accepted). Terms **Playbook**, **Playbook item** and **Advice** are defined in `GLOSSARY.md`; this is the shape and process.

```
Playbook item ─ kind (sign | tip | exercise | Talk question), text, Skills (≥1) or "general",
                level band (low 1–2 | mid 3 | high 4–5, optional; none = any level),
                origin (base | Commander), source Entry (optional), active | retired
  base items      → ship as files in the plugin, read at runtime, improve via plugin updates
  Commander items → artifact DB, owned by the Commander (not the Cycle), carry over between Cycles
  per-Commander hide list over base items
Advice ─ never stored; generated on demand, marked "(הצעה)"
```

Decisions:
1. **Flat items, not per-Skill entries.** One item = one text of one kind, tagged to one or more Skills or "general" (e.g. running a Talk). One tip can serve all three סדר וארגון Skills without copying.
2. **Four kinds**: sign (what weakness/strength looks like), tip (for the Commander), exercise (for the Trainee), Talk question.
3. **Optional level band** low 1–2 / mid 3 / high 4–5; an untagged item fits any level. Band edges follow "How does the agent turn Evidence into a 1–5 Rating?".
4. **Base authoring**: the agent drafts it in Hebrew, one batch per Stage plus the Interpersonal group; the Commander reviews each batch; approved items ship with origin `base`. Size guideline per Skill: ~2 signs (one weak, one strong), 2–3 tips, 1–2 exercises, 2 Talk questions, plus a small "general" set; thin Skills may have fewer. Drafting the content is build work after the spec, not part of this map.
5. **Base lives in the plugin**, read at runtime, so improvements ship as plugin updates. Commander items live in the artifact DB. The agent merges both on read. The v1 dashboard shows no Playbook (page code reads only the DB).
6. **Adding Commander items**: (a) explicitly ("תוסיף לפלייבוק של דיבאג: …") or (b) the agent spots something that worked in an Entry and offers to save it. Always confirmed by the Commander, never auto-added. Text kept word-for-word, linked to its source Entry if any.
7. **Two origins only.** For a Skill the Commander added (no base), the agent offers draft items marked "(הצעה)"; accepted ones become `Commander` items.
8. **Lifecycle**: Commander items are editable and retirable (they are advice, not Evidence). Base items can be hidden per Commander and un-hidden; never changed.
9. **Scope**: Commander items belong to the Commander, outliving Cycles.
10. **Advice is ephemeral**, always "(הצעה)". It becomes a record only when accepted as an improve/keep item or Follow-up. Whether a tip was tried and worked is captured as ordinary Evidence when the Commander reports it; no "advice given" entity.
11. **Building Advice**: target the Trainee's lowest or declining Skills plus any Commander-requested focus → pick items whose band fits the Rating → prefer Commander items over base → skip items the Evidence shows were tried without effect → rewrite each to the Trainee's actual Evidence, citing it → 2–3 suggestions max.
12. **Signs double as recognition cues** when the agent proposes Assessments from raw Evidence (weighting rules stay in the Rating ticket).
13. **Surfaces**: pre-Talk brief (focus points, opening questions), direct asks ("איך לעזור ל-X בדיבאג?"), team status (one action for a shared weakness). Not the post-update confirmation line. Formats stay in the "Output formats" fog.

Knock-on effects recorded on other tickets: the storage mapping must hold Commander-scoped items and base-item hides in a per-Cycle DB, keyed to stable base-item ids; the Rating rules fix the band edges; the dashboard has no Playbook view.

**Later change (from "How should the dashboard artifact look and behave?" (08), 2026-10-29):** the Commander chose to show 2–3 suggested questions for the next Talk on the dashboard's Trainee window. The agent stores them display-safe on the Trainee card (`nextTalk`), still marked "הצעה". Other Advice stays in chat and briefs only, and the dashboard still has no Playbook view.
