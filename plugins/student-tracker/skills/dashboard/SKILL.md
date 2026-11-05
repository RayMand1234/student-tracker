---
name: dashboard
description: Opens the Cycle's dashboard ("תפתח דשבורד").
argument-hint: ""
allowed-tools: Agent, ArtifactData, Bash(student-tracker-store *), Bash(date *)
model: haiku
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

The `student-tracker:tracker` skill's instructions, loaded here (don't call the Skill tool):

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot --tracker`

Follow them for this request:

תפתח דשבורד $ARGUMENTS
