# What does `/student-tracker:setup` ask, and what does it create?

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: raymandelvei (claimed 2026-10-29)
Blocked by: 01, 02, 03

## Question

Decide the setup conversation and its outputs: which questions (Commander name and role, Cycle name/color, Trainee first names, Talk cadence target and thresholds, extra info per Trainee, course preset confirmation/overrides), one batch vs step-by-step, what is mandatory vs addable later, what setup creates (artifact, initial documents, persisted per-Commander config), how it behaves when re-run (new Cycle vs edit current), and the final hand-off message. Constrained by what "Can a Claude Code plugin create and drive a Cycle's artifact database?" (01) and "How is a Claude Code plugin packaged, namespaced, configured and distributed?" (02) find.

## Answer

Resolved with the Commander on 2026-10-29 (grilling, 12 questions in two rounds, all accepted). Terms **Course preset** and the Cycle start date are in `GLOSSARY.md`.

**Flow**
1. **Preflight first, before any question.** Check that `Artifact` exists and that ToolSearch finds `ArtifactData`. On failure, stop with one Hebrew message that lists the likely causes and their fixes: paid plan, `/login` with a claude.ai account, no API key/Bedrock/Vertex, org policy or `enableArtifact`, `-p` mode. A git-free install path is still open in the map's fog.
2. **Look for an existing Cycle.** Read the local pointer. If there is none, run `Artifact list` for titles starting with "מעקב חניכים ·".
   - Found and `done`: ask "להתחבר למחזור <name>, או להתחיל מחזור חדש?". Connect writes the pointer and stops (new machine, reinstall). New Cycle continues below; archiving and carry-over belong to the "Cycle lifecycle" fog.
   - Found and `in-progress`: resume seeding into that artifact, re-showing the summary from what is stored. Never publish a second one.
   - Not found: first-time setup.
3. **One batched Hebrew question message**, defaults shown inline, answered in free text, partial answers allowed:
   - Mandatory: Commander name (how they want to be addressed) and Cycle name/color.
   - Defaulted: role (default "not stated"), Talk target 10 days with yellow 10 / red 14, Cycle start date (default today; anchors the Schedule), Course preset (default: shipped Fullstack).
   - Optional, addable later in normal chat: Trainee first names, extra info per Trainee, Project teams, extra Skills.
   - The Course preset is shown as a 3–4 line summary (Subjects in order, Projects, Test count, 21 weeks) with "תואם לקורס שלך?". Free-text differences are applied to this Cycle's copy, and the agent shows what changed. The preset's actual content stays in the "Course preset" fog.
   - On a new Cycle, Commander settings (name, role, Talk thresholds) are prefilled from the previous Cycle ("ממשיך עם: … — לשנות?"). They are Commander-scoped, like the Commander's Playbook items.
4. **Confirm.** Show a short summary ("זה מה שאקים — לאשר?") and warn that Claude Code will ask permission once to publish. Nothing is created before the Commander confirms.
5. **Create**, in this order:
   1. Publish a private plain-HTML page (`db` + `user`) titled **"מעקב חניכים · <Cycle name>"**, with `pin: true`.
   2. Write the pointer `${CLAUDE_PLUGIN_DATA}/cycles.json` (`{current: url, archived: []}`) right away, before seeding. It holds only the URL.
   3. Seed the database: Commander settings, the Cycle (name, start date, preset copy, Skill framework, setup state `in-progress`), one document per Trainee, and the setup Entries. Then set the setup state to `done`.
6. **Hand-off message** in Hebrew: what was created (Cycle, Trainees, Talk target), the dashboard link, three starter phrases ("דיברתי היום עם נועה…", "תכין לי שיחה עם נועה", "מה המצב"), and one line on turning on auto-update (`/plugin` → Marketplaces).

**Rules**
- Extra info about a Trainee given at setup is an ordinary **Entry**. It is split into Evidence with sensitive details flagged, exactly like later updates. Setup stores no Trainee fields beyond the first name.
- **Duplicate first names**: the agent asks for a short distinguishing label (a last-name initial or a nickname, e.g. "נועה כ."). That label becomes the display name. An update that says only "נועה" triggers a question about which one. No other identifying details are stored.
- **Setup never edits the current Cycle.** Settings changes ("שנה יעד שיחות ל-7", "נועה עזבה") go through normal chat.
- **Other skills with no pointer** run the same title lookup without asking. One match: connect and cache the URL. Several: ask which one. None: "עוד לא הוקם מעקב — הרץ `/student-tracker:setup`".

Knock-on effects recorded on other tickets: the storage mapping must hold Commander-scoped settings, a Cycle setup state and Trainee display names. The command surface inherits the user-only setup and the silent pointer lookup for every other skill.
