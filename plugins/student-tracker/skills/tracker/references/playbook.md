**Load:** playbook

# The Commander's Playbook

Base items: hide/un-hide only. The Commander's own carry into the next Cycle.

**Confirm first:** state the change in 1–2 Hebrew lines ending "(כן / לא)", writing nothing. Clear yes ("כן", "מאשר", "יאללה") → apply, one line ("נשמר בפלייבוק: …", "עודכן: …"). Anything else → write nothing; "לא שמרתי כלום." or handle the new request.

No `לביטול` line; "בטל" doesn't undo these (the reverse change is confirmed too).

In replies: kinds סימן / טיפ / תרגיל / שאלה לשיחה; bands רמה נמוכה (1–2) / בינונית (3) / גבוהה (4–5); Skills by Hebrew name, never id.

## Adding an item ("תוסיף לפלייבוק של דיבאג: …")

- **Text**: their words after the colon (or "ש…"), word-for-word: never rephrase, shorten, translate or fix. None clear → "מה לשמור, במילים שלך?".
- Names a Trainee or tells something personal → say so, ask for wording without it.
- **Kind**: `tip` (Commander does), `exercise` (Trainee does), `talk-question`, `sign` (what a weakness or strength looks like). Unsure → pick one, show it.
- **Skills**: from `readCycle` → `skills`, never archived; a name in several Stages → ask which, or all. Running Talks or no Skill → `general`.
- **Band**: only if they give a level ("למתקדמים" → high); never on `general`.

```
לשמור בפלייבוק שלך — יכולות דיבאג, טיפ: "לבקש להסביר לי את הקוד בקול לפני שאני מסתכל"? (כן / לא)
```

Yes → `savePlaybookItem` → `נשמר בפלייבוק: "<text>" (יכולות דיבאג, טיפ).`

## Offering to save from an update

When a logged update tells of a method that clearly **worked** (helping, an exercise, running a Talk), offer it just before the `לביטול` line:

```
(הצעה) לשמור בפלייבוק (יכולות דיבאג, טיפ): "ישבנו יחד והיא הסבירה לי בקול"? (כן / לא)
```

- Quote **word-for-word** the few words of what worked; no sensitive part, Trainee name, or own words.
- At most one per update, only if the reply asks nothing else, only for a method worth reusing.
- Yes → (load `playbook`) `savePlaybookItem` with `source` = that Entry and the text as quoted, then `נשמר בפלייבוק: …`. Anything else → save nothing. **Never save without a yes.**

## Editing or retiring the Commander's item

Find it in `readCycle` → `playbook` (`retired: false`); ask which if several.

- **Edit**: `לשנות את הטיפ (יכולות דיבאג) מ-"<old>" ל-"<new>"? (כן / לא)` → `savePlaybookItem` with its `id` and only what changes (new text word-for-word).
- **Retire** ("תוריד את הטיפ שלי על…"): `להוריד מהפלייבוק את "<text>"? הוא יישמר, ולא אציע אותו יותר. (כן / לא)` → `retirePlaybookItem`.

## Hiding or un-hiding a base item

Base items: `data/playbook.json` under the plugin root (`items`), or `origin: base` items read in this conversation. Hidden ids: `readCycle` → `commander.hides.hidden`.

- **Hide** ("אל תציע לי יותר את…"): `להסתיר מהפלייבוק את "<text>"? אפשר להחזיר בכל זמן. (כן / לא)` → `hidePlaybookItem(id, hidden: true)`.
- **Un-hide**: `להחזיר לפלייבוק את "<text>"? (כן / לא)` → `hidePlaybookItem(id, hidden: false)`.
- "תשנה את זה ל…" on a base item → one confirmation: hide it + save their wording as theirs.
- "תוריד את…" unspecified: Commander's item → retire; base item → hide.

Their own item, suggested, "doesn't work" → offer to retire it.

## A Skill the Commander added

(id has `.c-`, no base items.) Right after `addSkill`, and when Advice targets it with no items, offer drafts once per Skill per conversation:

```
אין עדיין פריטים לניהול זמן בפלייבוק. כמה הצעות:
(הצעה) טיפ: לבקש ממנה לתכנן בבוקר מה תסיים עד הצהריים, ולבדוק איתה בצהריים.
(הצעה) תרגיל: לכתוב הערכת זמן לפני כל משימה, ולהשוות בסוף היום.
(הצעה) שאלה לשיחה: מה לקח לך יותר זמן ממה שחשבת השבוע?
לשמור אותן בפלייבוק שלך? (כן / רק חלק / לא)
```

No Trainee. Yes → `savePlaybookItem` each, text as shown, tagged to it. "רק את הראשונה" → only those; own wording → theirs. Else nothing.

## "מה יש לי בפלייבוק?"

`readCycle`: their live items by Skill, `<kind>: "<text>"`, and how many base items are hidden.
