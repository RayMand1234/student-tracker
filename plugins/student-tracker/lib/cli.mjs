import fs from 'node:fs';
import { openStore, StoreError } from './store.mjs';
import { parseCycle, parseEntry, parseAssessments, parseCycleChange, parseTraineeChange, parseSettings, parsePlaybookItem } from './payload.mjs';

const USAGE = `usage: student-tracker-store --data <plugin data dir> <operation> [args]
  connect
  create-cycle            < lines "commander: <name>", "cycle: <name>", "trainee: <name>" (repeat),
                            optional "role:", "start: YYYY-MM-DD", "target:", "yellow:", "red:"
  finish-setup            (last step of setup: marks the Cycle done)
  read-cycle
  read-team
  read-trainee <tid> [--since YYYY-MM-DD] [--retracted]
  read-playbook <tid> [<skill id> …]   (the Playbook items for Advice; no Skill: the Trainee's targets)
  record-entry [--insist] < "--- entry" + message, then per Evidence "--- evidence <tid> <kind> <date>",
                            "+key: value" field lines, excerpt; "--- followup" + text after its Evidence;
                            "--- sensitive <category>" + "+kind:"/"+closes:" lines + sentence after its Evidence;
                            "--- assessment <tid> <skill id> <score> <author>" + "+evidence: #<n>, <id>" + reason;
                            "--- item <tid> improve|keep <by>" + "+from:" + text; "--- status <tid> <to>",
                            "--- stage <tid>" + "+to:", "--- snapshot <tid>", "--- retire <tid> <item> <by>",
                            "--- next-talk <tid>" + one question per line
  record-assessments [--insist]
                          < "--- assessment" blocks of one Trainee, citing stored Evidence ids,
                            optional "--- next-talk <tid>" + one question per line
                          (--insist: the Commander asked to record about a Trainee who left)
  save-playbook-item [<item id>]
                          < "+kind:", "+skills:", "+band: low|mid|high|none", "+source: <entry id>" lines,
                            then the text word-for-word (with an id: an edit, only the lines that change)
  retire-playbook-item <item id>
  hide-playbook-item <base item id> | unhide-playbook-item <base item id>
  flip-sensitive <evidence id> [--category <category>]
  retract-entry [<entry id>]   (the last Entry when none is named)
  hard-delete <entry id>       (only on the Commander's explicit, confirmed request)
  update-trainee [<tid>]  < one of "add: <name>" (no tid), "rename: <name>", "rejoin",
                            "leave: YYYY-MM-DD" + "how: dismissal|transfer|other" + "reason: <text>",
                            "status: good|watch|concern" + "reason: <text>" + optional "evidence: <ids>"
  update-settings         < any of "name:", "role:", "target:", "yellow:", "red:" lines
  update-cycle            < one change: "add-test: <name>" | "edit-test: <test>" | "remove-test: <test>" |
                            "add-project: <name>" | "remove-project: <project>" | "week: <n>" |
                            "remove-week: <last week>" | "add-skill: <name>" | "archive-skill: <id>" |
                            "restore-skill: <id>" | "team: <name>", then its field lines (storage-local.md)
  resume-pending
  rebuild-card <tid>`;

export async function main(argv) {
  const args = [...argv];
  const opt = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    return args.splice(i, 2)[1];
  };
  const dataDir = opt('--data');
  const since = opt('--since');
  const category = opt('--category');
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i !== -1) args.splice(i, 1);
    return i !== -1;
  };
  const retracted = flag('--retracted');
  const insist = flag('--insist');
  const [op, ...rest] = args;
  const stdin = () => fs.readFileSync(0, 'utf8');

  try {
    const store = openStore({ dataDir });
    const ops = {
      connect: () => store.connect(),
      'create-cycle': () => store.createCycle(parseCycle(stdin())),
      'finish-setup': () => store.finishSetup(),
      'read-cycle': () => store.readCycle(),
      'read-team': () => store.readTeam(),
      'read-trainee': () => store.readTrainee(rest[0], { since, retracted }),
      'record-entry': () => store.recordEntry({ ...parseEntry(stdin()), insist }),
      'read-playbook': () => store.readPlaybook(rest[0], { skills: rest.slice(1) }),
      'record-assessments': () => {
        const { trainee, assessments, nextTalk } = parseAssessments(stdin());
        return store.recordAssessments(trainee, assessments, { insist, nextTalk });
      },
      'update-trainee': () => store.updateTrainee(rest[0] ?? null, parseTraineeChange(stdin())),
      'update-settings': () => store.updateSettings(parseSettings(stdin())),
      'update-cycle': () => store.updateCycle(parseCycleChange(stdin())),
      'save-playbook-item': () => store.savePlaybookItem({ ...(rest[0] ? { id: rest[0] } : {}), ...parsePlaybookItem(stdin()) }),
      'retire-playbook-item': () => store.retirePlaybookItem(rest[0]),
      'hide-playbook-item': () => store.hidePlaybookItem(rest[0], true),
      'unhide-playbook-item': () => store.hidePlaybookItem(rest[0], false),
      'flip-sensitive': () => store.flipSensitive(rest[0], { category }),
      'retract-entry': () => store.retractEntry(rest[0]),
      'hard-delete': () => store.hardDelete(rest[0]),
      'resume-pending': () => store.resumePending(),
      'rebuild-card': () => store.rebuildCard(rest[0]),
    };
    if (!ops[op]) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    process.stdout.write(`${JSON.stringify(ops[op](), null, 2)}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
}
