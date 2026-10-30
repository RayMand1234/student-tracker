---
name: setup
description: Sets up Trainee tracking for a new Cycle — asks the Commander's name, the Cycle name and the Trainees' first names, then creates the Cycle's store. Run once per Cycle.
argument-hint: "[שם, מחזור, שמות חניכים]"
allowed-tools: Bash(student-tracker-store *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

# הקמת מעקב חניכים

Set up tracking for one Cycle. Talk to the Commander in Hebrew only, short and plain. Setup creates a Cycle; it never edits an existing one (changes go through normal chat).

Storage is reached through the store command, always with the plugin data dir:

```
student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" <operation>
```

## 1. Existing Cycle?

Run `connect`.
- It fails with "עוד לא הוקם מעקב" → first-time setup, continue.
- It succeeds with `setup: done` → tell the Commander "כבר קיים מעקב למחזור <cycle>. אפשר פשוט לכתוב לי עדכונים." and stop.
- It succeeds with `setup: in-progress` → an earlier setup was interrupted. Say so, read what is stored (`read-cycle`, `read-team`), and continue with step 2 using it as the answers so far. Step 3 then finishes seeding into the same store.

## 2. Collect the answers

Needed: the Commander's name (how they want to be addressed) and the Cycle name or color. Optional: the Trainees' first names (they can be added later in chat).

If the command arguments already give the Commander's name and Cycle name, use them and skip the question. Arguments: $ARGUMENTS

Otherwise ask everything in **one** message and wait for the answer:

> כדי להקים את המעקב:
> 1. איך לקרוא לך?
> 2. שם/צבע המחזור?
> 3. שמות החניכים (שמות פרטיים בלבד) — אפשר גם להוסיף אחר כך.

Then, always, show a short summary ending with "זה מה שאקים — לאשר?" (Commander, Cycle, Trainees, Talk target every 10 days) and wait for a yes. Nothing is created before the Commander confirms.

Rules:
- First names only. Never store last names or other identifying details.
- Two Trainees with the same first name: ask for a short distinguishing label (a last-name initial or nickname, e.g. "נועה כ.") and use it as the display name.
- Defaults: Cycle start date today; Talk target 10 days, yellow 10, red 14.

## 3. Create

Run `create-cycle` with the answers on stdin, one `key: value` per line (`trainee:` once per Trainee; add `start: YYYY-MM-DD` only if the Commander gave a start date):

```
student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" create-cycle <<'CYCLE'
commander: <name>
cycle: <cycle>
trainee: <first name>
trainee: <first name>
CYCLE
```

Send exactly this shape. Don't wrap it in JSON, `printf` or a temp file.

It writes the pointer first, then seeds the Cycle, the Skill framework, the Commander settings and one Trainee card per name, and prints the Trainee ids. If it refuses (for example a duplicate name), fix the input with the Commander and run it again.

## 4. Hand-off

One short Hebrew message:
- What was created: the Cycle, the Trainees, Talk target every 10 days.
- Three ways to start: "דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב".
