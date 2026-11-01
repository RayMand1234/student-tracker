---
name: research
description: Online research on one Trainee's situation; nothing personal goes to the web ("תחקור את המצב של <שם>").
argument-hint: "<שם החניך> [נושא]"
allowed-tools: ArtifactData, Bash(student-tracker-store *), Bash(date *), WebSearch, WebFetch
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

The `student-tracker:tracker` skill's instructions, loaded here (don't call the Skill tool):

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot research --tracker`

Follow them for this request:

תחקור את המצב של $ARGUMENTS ותמצא מקורות טובים ברשת
