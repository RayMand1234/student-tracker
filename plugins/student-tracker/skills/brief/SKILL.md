---
name: brief
description: Pre-Talk brief on one Trainee, readable a minute before the Talk — what changed since the last Talk, what to check, focus points, something to reinforce, opening questions. The shortcut for "תכין לי שיחה עם <שם>".
argument-hint: "<שם החניך>"
allowed-tools: Skill
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

Run the `student-tracker:tracker` skill with the Skill tool, passing it this request, and follow it:

תכין לי שיחה עם $ARGUMENTS
