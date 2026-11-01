---
name: brief
description: Pre-Talk brief on one Trainee ("תכין לי שיחה עם <שם>").
argument-hint: "<שם החניך>"
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

The `student-tracker:tracker` skill's instructions, loaded here (don't call the Skill tool):

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot brief --tracker`

Follow them for this request:

תכין לי שיחה עם $ARGUMENTS
