---
name: status
description: Team status: who needs a Talk, who is declining, shared weaknesses ("מה המצב").
argument-hint: ""
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *)
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

The `student-tracker:tracker` skill's instructions, loaded here (don't call the Skill tool):

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot status --tracker`

Follow them for this request:

מה המצב בצוות? $ARGUMENTS
