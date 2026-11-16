---
name: hertzl-post
description: Posts the latest Talks from the tracker to Herzl (herzl.bsmch.net) as שיחה אישית with a short summary, skipping Talks Herzl already has ("תעלה להרצל את השיחות האחרונות").
argument-hint: "[Trainee name] [since YYYY-MM-DD]"
allowed-tools: Read, ToolSearch, Bash(student-tracker-store *), Bash(date *), mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__computer
model: sonnet
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

You copy the Commander's recent Talks from the tracker into Herzl, where each becomes one שיחה אישית post on the Trainee, with a summary in the post's staff text. Terms: Commander, Trainee, Talk, Evidence.

Reply in Hebrew, short and plain. Never say a Talk was posted unless Herzl returned success **and** a read-back found it in this conversation.

Reads the tracker's records through `student-tracker-store` (loaded below); never writes to it.

## 1. Which Talks

Arguments: `$ARGUMENTS`. A name → that Trainee only; none → every active Trainee. A date → talks from that day; none → the last 14 days (`date +%F`, and 14 days back).

- `read-team` for the Trainees and ids. `read-trainee <tid> --since <day>` for each (all of them when no name, in one message). Keep `evidence` with `kind: talk` only. Records in `sensitive` and the "[פרט אישי — בתיק]" marker are left out by default (say once at the end "השארתי בחוץ פרטים אישיים מ-<name>"); when the Commander asks for the details, put the `sensitive` records of that Talk back where the marker stood. The post is staff-only either way.
- Evidence cut from one Entry on the same day and Trainee is one Talk: join their texts in order.
- No Talks → "אין שיחות חדשות לאחר <day>", stop.

## 2. Herzl

Read `${CLAUDE_PLUGIN_ROOT}/skills/hertzl-fetch/references/api.md` and follow it to get a signed-in Herzl tab and `window.H`. Match each tracker Trainee to `H.students()` by full name. No match or several → ask; never guess.

## 3. Already there?

Per Trainee with Talks: `H.feed({taggedUsersIds: [id], interactionTypes: ['שיחה אישית'], startDate: <earliest Talk day − 3 days, ISO>})`, `H.slim` each (the post's `staff` text is plain text). A Talk is **already posted** when a Herzl post (by anyone) lies within ±1 day of the Talk's day **and** says about the same thing: the same topics or facts, even if worded differently or shorter. Same day but a different subject is **not** a duplicate (two Talks in a day happen). Decide each Talk as: `יש` (clear match, skip it), `אין` (post it), or `לא בטוח` (a post in the window that might be it): show both texts and ask.

## 4. Summary

For each `אין` Talk write the post text yourself from its Evidence, in the Commander's voice, Hebrew: 2–5 short lines — what was discussed, how the Trainee was, what was agreed or is open. Only what the Evidence says; no names of other people's problems, no ratings, no advice you made up. Keep the Commander's own key words.

Many Trainees: the summaries may be written by one subagent per Trainee (tracker reads and the Hebrew text only, no browser, returning the HTML), but steps 2, 3 and 5 stay with you in the one tab: one `feed` call for the course, all matching and checking in the page, all posts and read-backs in one `javascript_tool` call.

## 5. Confirm, post, verify

- Show one list before posting anything: `<Trainee> · DD/MM` and the summary, for each Talk to post; below it `כבר ברצל (דילגתי): …` with names and days. Ask once: "להעלות?" Post only on a clear yes; "בלי X" drops X.
- Per Talk: `H.post({studentId, day, html})` with `html` = each line as `<p>` + `H.esc(line)` + `</p>`. Non-2xx → show `status` and `body`, stop, post nothing further, retry nothing.
- Then read each back (`H.feed` with that Trainee and `startDate` the Talk's day − 1) and look for the new post by text. Reply per Talk `✓ <name> DD/MM` or `✗ <name> DD/MM — לא נמצא אחרי ההעלאה`. A post made by mistake is removed only when the Commander asks (api.md says how).

## Loaded

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot recall`
