# The Commander's Playbook

The **Playbook** is what Advice draws on ([advice.md](advice.md)): the base items that ship with the plugin, plus the Commander's own. Each item is a `sign` (what a weakness or strength looks like), a `tip` (for the Commander), an `exercise` (for the Trainee) or a `talk-question`, tagged to Skills or "general", optionally to a level band.

- **The Commander's items** are theirs, not the Cycle's: they carry into the next Cycle. They can add, edit and retire them. A retired item stays stored and is never suggested again.
- **Base items** are never changed. The Commander can hide one (it stops being suggested) and un-hide it.

These are the Commander's own settings, so **nothing changes before the Commander confirms**, as in [roster.md](roster.md):

1. Work out the change (below). Write nothing yet.
2. Reply with what will change, in one or two plain Hebrew lines, ending "(כן / לא)".
3. A clear yes ("כן", "מאשר", "יאללה") → apply it, then reply in one line ("נשמר בפלייבוק: …", "עודכן: …"). Anything else → write nothing; "לא שמרתי כלום." or handle the new request.

They are not Entries: no Retraction line, and "בטל" does not undo them; the Commander asks for the reverse change (confirmed too).

In replies, name kinds and bands in Hebrew: סימן / טיפ / תרגיל / שאלה לשיחה; רמה נמוכה (1–2) / בינונית (3) / גבוהה (4–5). Name Skills by their Hebrew names, never by id.

## Adding an item ("תוסיף לפלייבוק של דיבאג: …")

- **Text: the Commander's words, word-for-word**, the part after the colon (or after "ש…"). Never rephrase, shorten, translate or fix it. No clear text → ask for it ("מה לשמור, במילים שלך?").
- **Not about one Trainee.** The item carries into the next Cycle and serves every Trainee. If the text names a Trainee or tells something personal, say so and ask for the words to save without it.
- **Kind**: `tip` when it's something the Commander does; `exercise` when it's for the Trainee to do; `talk-question` when it's a question to ask the Trainee; `sign` when it describes what a weakness or strength looks like. Unsure → pick one and show it; the Commander corrects it in their answer.
- **Skills**: the Skill(s) they name, as ids from `readCycle` → `skills` (a name in several Stages, like "סדר וארגון": ask which, or all). About running Talks or no Skill in particular → `general`. Never an archived Skill.
- **Band**: only when they give a level ("למי שממש נתקע" → low, "למתקדמים" → high). Otherwise none. A `general` item has no band.

```
לשמור בפלייבוק שלך — יכולות דיבאג, טיפ: "לבקש להסביר לי את הקוד בקול לפני שאני מסתכל"? (כן / לא)
```

Yes → `savePlaybookItem` → `נשמר בפלייבוק: "<text>" (יכולות דיבאג, טיפ).`

## Offering to save from an update

When you log an update ([log.md](log.md)) that tells of something that clearly **worked**, a way of helping, an exercise or a way to run a Talk that visibly made a difference ("ישבנו יחד והיא הסבירה לי בקול, ככה מצאה לבד את הבאג"), offer to keep it, as one line just before the Retraction line:

```
(הצעה) לשמור בפלייבוק (יכולות דיבאג, טיפ): "ישבנו יחד והיא הסבירה לי בקול"? (כן / לא)
```

- The quoted text is copied **word-for-word** from the message, the few words that say what worked. Never a sensitive part, never a Trainee's name, never your own words.
- At most one offer per update, and only when the reply asks nothing else (a proposal, a missing Test, a new Skill): one question at a time. Not for every good update: only a method worth reusing.
- A yes → `savePlaybookItem` with `source` = the Entry you just recorded and the text exactly as quoted, then `נשמר בפלייבוק: …`. Anything else ("לא", silence, a new update) → nothing is saved. **Never save without a yes.**

## Editing or retiring the Commander's item

Find it in `readCycle` → `playbook` (live ones: `retired` is `false`), by Skill and words. Several match → list them briefly and ask which.

- **Edit** ("תשנה את הטיפ שלי על הסבר בקול ל: …"): `לשנות את הטיפ (יכולות דיבאג) מ-"<old>" ל-"<new>"? (כן / לא)` → `savePlaybookItem` with its `id` and only what changes (the new text word-for-word; or the kind, Skills or band).
- **Retire** ("תוריד את הטיפ שלי על…"): `להוריד מהפלייבוק את "<text>"? הוא יישמר, ולא אציע אותו יותר. (כן / לא)` → `retirePlaybookItem`.

## Hiding or un-hiding a base item

Base items are in `${CLAUDE_PLUGIN_ROOT}/data/playbook.json` (`items`; read it with the Read tool), or an item `readPlaybook` gave you in this conversation (`origin: base`). The hidden ids are `readCycle` → `commander.hides.hidden`.

- **Hide** ("אל תציע לי יותר את…", "זה לא מתאים לי", after Advice "את השנייה אל תציע שוב"): `להסתיר מהפלייבוק את "<text>"? אפשר להחזיר בכל זמן. (כן / לא)` → `hidePlaybookItem(id, hidden: true)`.
- **Un-hide** ("תחזיר את הטיפ על…"): find it among the hidden ids → `להחזיר לפלייבוק את "<text>"? (כן / לא)` → `hidePlaybookItem(id, hidden: false)`.
- A base item is never edited. "תשנה את זה ל…" on a base item → offer both in one confirmation: hide it and save their wording as their own item.
- "תוריד את…" without saying whose: the Commander's item → retire; a base item → hide.

When a suggestion you gave came from the Commander's own item and they say it doesn't work, offer to retire it the same way.

## A Skill the Commander added

A Skill the Commander added (its id has `.c-`) has no base items. Right after `addSkill` is applied ([roster.md](roster.md)), and when Advice targets such a Skill and `readPlaybook` gives it no items, offer two or three draft items, once per Skill per conversation:

```
אין עדיין פריטים לניהול זמן בפלייבוק. כמה הצעות:
(הצעה) טיפ: לבקש ממנה לתכנן בבוקר מה תסיים עד הצהריים, ולבדוק איתה בצהריים.
(הצעה) תרגיל: לכתוב הערכת זמן לפני כל משימה, ולהשוות בסוף היום.
(הצעה) שאלה לשיחה: מה לקח לך יותר זמן ממה שחשבת השבוע?
לשמור אותן בפלייבוק שלך? (כן / רק חלק / לא)
```

Short Hebrew, general (no Trainee), fitted to the Skill. A yes → `savePlaybookItem` for each, the text exactly as shown, tagged to that Skill (they become the Commander's items). "רק את הראשונה" → only those; their own wording in the answer → their words. Anything else → nothing is saved.

## "מה יש לי בפלייבוק?"

`readCycle`: list the Commander's live items by Skill, `<kind>: "<text>"`, and say how many base items are hidden. A read: record nothing.
