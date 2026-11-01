# What is the domain model of Trainees, Evidence and Ratings?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Blocked by:

## Question

Pin down the entities and their relationships, independent of storage: Cycle, Commander, Trainee (status good/watch/concern, evaluation process stage, goals, background, improve/keep), the Evidence kinds (Talk, test, code review, project observation, self-assessment, note, clarification, sensitive personal detail), Stage, Skill, Rating, Playbook entry.

Key sub-questions: what fields each Evidence kind carries; how one Commander message splits into several Evidence items across Trainees; how a Rating links to the Evidence it rests on; how a Commander override is recorded; what counts as sensitive and how it is marked; which parts of the reference skill's model carry over and which change. Use `docs/skill-framework.md` and `docs/reference/trainee-mentoring/` as input.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, 18 questions, all accepted). Terms are defined in `GLOSSARY.md`; this is the shape.

```
Commander ─ name, role, Talk target + yellow/red thresholds (default 10 / 14 days)
Cycle ─ name/color, start date, course preset (Subjects, Tests + aliases, Projects, week-by-week Schedule),
        Skill framework (4 Stages + Interpersonal group, plus Skills the Commander adds)
  Project team ─ Project × Trainees
Trainee ─ first name, active/left (+ date, reason), Status (+ Status change history), evaluation-process stage,
          Snapshot, improve/keep items, last Talk date
Entry ─ one raw Commander message, kept whole
  └─ Evidence ─ exactly one Trainee, kind, date, order, word-for-word excerpt, sensitive flag, kind-specific fields
        kinds: Talk · test · code review · project observation · self-assessment form · improve/keep ·
               goal · background · evaluation-process event · note · clarification (→ original Evidence)
Follow-up ─ Trainee, word-for-word text, origin Evidence, open/done (+ closing Evidence)
Assessment ─ Trainee × Skill, score 1–5, author agent | Commander | Trainee, reason, → ≥1 Evidence; immutable
Rating ─ current value per Trainee × Skill, derived from Assessments
Playbook item ─ base | Commander (shape: "What does the Playbook look like and where does its base content come from?")
```

Decisions:
1. **One Evidence entity** with a shared core and kind-specific fields. Test: subject, catalog Test, score (null if not given), `self` verdict. Code review: related Test. Project observation: Project team. Talk: topics, plus the Follow-ups it opens and closes.
2. **Entry kept whole.** The agent splits it into Evidence, each pointing back with its own word-for-word excerpt, so a wrong split can be redone.
3. **One Evidence = one Trainee.** A team-wide sentence gives one Evidence per Trainee, all linked to the same Entry. A mention of another Trainee creates Evidence for them only when the text says something about them. One Evidence can back Assessments on several Skills.
4. **Assessment vs Rating.** An Assessment is immutable and dated. A Commander override is an Assessment the Commander authored. Rating is derived; the rules belong to "How does the agent turn Evidence into a 1–5 Rating?".
5. **Self-assessments** from a רמ"ת form are Assessments authored by the Trainee. They never count toward the Rating; the gap is a signal for מודעות עצמית. Per-Test self-verdicts go on that Test's Evidence as `self`.
6. **Follow-up is its own entity.** It can come from any Evidence and is closed by a later Evidence.
7. **Trainee holds only current state.** Background, goals and personal details are Evidence. Status is proposed by the agent with a reason and can be overridden by the Commander; every change becomes a Status change record. The evaluation-process stage changes only on the Commander's word, and each change is both Evidence and a stage-change record.
8. **Sensitive** covers health (physical or mental), family, distress or crisis, finances, romantic relationships, and discipline/legal. A sensitive sentence is split into its own sensitive Evidence. The public Evidence keeps the rest with "[פרט אישי — בתיק]" in its place. The agent marks it and tells the Commander, who can flip the mark. The evaluation process is not sensitive by default.
9. **Catalog.** Subjects, Tests (canonical name + aliases), Projects and the Schedule come from the course preset. An unknown Test is recorded as written, flagged, and added after the Commander confirms. The Schedule resolves an ambiguous "תרץ 1" by date.
10. **Skill framework** ships fixed. The Commander can add Skills to a Stage or group per Cycle; the agent proposes one when a theme recurs 3+ times. Skills are archived, never deleted.
11. **Only Talks that happened are modeled.** "Who needs a Talk" comes from the last Talk date and the cadence.
12. **Trainee active/left** with a date and reason. A Trainee who left is read-only and excluded from team stats.
13. **Improve/keep items** have a lifecycle (active → retired) and an origin Evidence. Agent items are marked "(הצעה)".
14. **Project teams** are recorded per Cycle; project observations link to their team.
15. **Evidence is immutable.** Corrections are clarifications. A hard delete happens only when the Commander explicitly asks.
