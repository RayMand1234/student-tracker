---
name: mind
description: Build or refresh the Mind page of your Trainees from what is already on record ("תבנה את ה-Mind"), e.g. after updating the plugin.
argument-hint: "[<שם החניך>]"
allowed-tools: Agent, ArtifactData, Bash(student-tracker-store *), Bash(date *)
model: sonnet
disable-model-invocation: true
metadata:
  plugin: student-tracker
---

The `student-tracker:tracker` skill's instructions, loaded here (don't call the Skill tool):

!`student-tracker-store --data "${CLAUDE_PLUGIN_DATA}" boot mind --tracker`

Follow them for this request:

תבנה את ה-Mind של החניכים $ARGUMENTS
