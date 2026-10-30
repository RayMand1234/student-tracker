# 17: Retraction ("בטל")

**Spec:** `.scratch/student-tracker/spec.md` (Retraction stories; Storage → Retraction); ticket 07

**What to build:** The Commander can withdraw a mistaken update. "בטל" retracts the last Entry; naming an earlier Entry retracts that one. Everything cut from it (Evidence, sensitive records, Assessments, Follow-ups, improve/keep items) stops counting and stops showing, but stays stored. Affected cards are rebuilt using the same resumable chunk protocol. A hard delete happens only on an explicit request.

**Blocked by:** 12, 15, 16

**Status:** resolved

- [x] `retractEntry` sets `retracted: {at}` on the Entry and flips `retracted` to `true` on every child, including `sensitive` records; content untouched
- [x] Every query filters `retracted == false` explicitly
- [x] Affected cards are rebuilt; the work is marked `retraction: writing | done` and finished by `resumePending` if interrupted
- [x] Ratings recompute without the retracted Assessments (eval with the shared fixtures)
- [x] The Retraction reply names what was withdrawn; exact layout follows ticket 10 once resolved
- [x] `hardDelete` runs only on an explicit Commander request and confirms first

## Comments

Decisions taken while building (agent-decided, veto any):

- **Which Entry a bare "בטל" takes.** Right after the agent recorded an Entry in this conversation, it passes that Entry's id (so "the last one" never depends on two Entries written in the same second). In a fresh conversation it is the last Entry written (`at`, then id). If that one is already retracted, the reply is "הרישום הזה כבר בוטל": "בטל" never reaches past it to an older Entry. After a re-rate, an accepted proposal or a sensitive flip, "בטל" says those aren't Entries, names what does undo them, and asks whether the last update was meant. A Retraction itself can't be undone ("אפשר לכתוב את העדכון מחדש").
- **A named earlier Entry** is matched by the day it was written or its Evidence dates. Exactly one match is retracted without asking; several or none get a short which-one question.
- **Retracted records are dead everywhere.** `readTrainee` leaves them out unless asked with `retracted` (CLI `--retracted`), and a retracted Evidence can no longer be cited by an Assessment, clarified, flipped, or close a Follow-up. Other Entries' records stay untouched: a Follow-up the retracted Evidence closed opens again, and Assessments elsewhere that cite it count it out of their `n`.
- **Protocol.** The Entry is marked `retracted: {at}` + `retraction: writing` first, so it disappears at once; each Trainee's chunk then flips that Trainee's records (found wherever a flip moved them) with the rebuilt card, version-pinned; then `retraction: done`. An Entry still `writing` is finished first, so a resume can't recreate its records unflagged. `resumePending` finishes Entries, then Retractions, then hard deletes.
- **`hardDelete(eid)`** takes an explicit id only, retracted or not, uses the same chunked protocol (`deletion: writing`, then the Entry is deleted last), and a session still writing that Entry's chunks won't recreate the deleted records. The agent asks "למחוק לצמיתות …? אי אפשר לשחזר. (כן / לא)" and deletes only on a clear yes. "Hard delete" added to `GLOSSARY.md`.
- **Reply layout** (provisional until ticket 10): "בוטל הרישום מ-DD/MM HH:MM: "<opening words of a public excerpt>…"", one line per Trainee with what was withdrawn, "נפתחה שוב: …" for reopened Follow-ups, Rating lines `<Skill> 3→2` / `4→—`, and "הרישום נשמר כמבוטל: לא נספר ולא מוצג." Sensitive parts appear only as the marker; there is no "לביטול" line.
- Still not covered: standalone Assessments (`a-…`) and sensitive flips aren't Entries, so "בטל" doesn't withdraw them.
