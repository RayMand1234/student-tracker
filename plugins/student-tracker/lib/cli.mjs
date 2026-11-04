import fs from 'node:fs';
import { openStore, StoreError } from './store.mjs';
import { boot } from './boot.mjs';
import { isOperation, runOperation } from './operations.mjs';
import { planOperation, readsFor, plannedOperations } from './plan.mjs';

const USAGE = `usage: student-tracker-store --data <plugin data dir> [--cycle <archived Cycle address>] <operation> [args]
  (--cycle: read a Cycle from the pointer's archived list; every write to it is refused)
  boot [<route>] [--tracker]   (plain text: the pointer, its backend's store cores; a route file and the
                            store families its Load line names; --tracker: the tracker's instructions first)
  start                   (connect, resumePending, readCycle and readTeam in one call)
  connect
  create-cycle            < lines "commander: <name>", "cycle: <name>", "trainee: <name>" (repeat),
                            optional "role:", "start: YYYY-MM-DD", "target:", "yellow:", "red:",
                            "previous: <current Cycle address>" (a new Cycle after it)
  copy-commander-scope <previous Cycle address>   (setup of a new Cycle, after create-cycle)
  archive-cycle <previous Cycle address>          (setup of a new Cycle, after the copy)
  finish-setup            (last step of setup: marks the Cycle done)
  read-cycle
  read-team
  read-trainee <tid> [--since YYYY-MM-DD] [--retracted]
  read-playbook <tid> [<skill id> …]   (the Playbook items for Advice; no Skill: the Trainee's targets)
  read-status             (team status: who needs a Talk, who is declining, shared weaknesses)
  take-alert [<tid> <theme…>]   (the one alert for this reply, marked shown today; <tid> <theme>: a
                            pattern repeated 3+ times for the Trainee just written about)
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
  record-next-talk        < "--- next-talk <tid>" + one question per line (the brief's questions)
  record-snapshot         < "--- snapshot <tid>" + text (a fresh Snapshot after marking something sensitive)
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
                            "restore-skill: <id>" | "team: <name>", then its field lines (store/local/roster.md)
  resume-pending
  rebuild-card <tid>
artifact backend (no --data):
  reads <operation> --snapshot <fresh snapshot folder> [args]
                          < the operation's payload. Prints {reads}, one ArtifactData read per line
                            (get, list or query, with out_dir): send them all in one message.
  plan <operation> --snapshot <snapshot folder> --versions <file> --out <fresh plan folder> [args]
                          < the operation's payload. Runs it over the snapshot and prints {result, plan,
                            batches}: each batch is the "writes" of one ArtifactData batch, sent in order.
                            --versions: each read made, its line as "reads" printed it (one that found
                            nothing too), and one "<collection path>/<doc id> <version>" line per document
                            found, or the read results' lines as printed. Refuses "missing reads" with the
                            reads still to make, one per line. A read writes nothing: its plan is null, batches [].
                            --pointer <the pointer file>: read only; needed by create-cycle, copy-commander-scope
                            and archive-cycle, and to name the current Cycle when a write to an archived one is
                            refused. A read with a "url" is of another Cycle: send it to that address. When the
                            plan prints "pointer", write it as the pointer file before sending the batches; when
                            it prints "url", send the batches to that address, not the current Cycle.
                            Several batches come with "if_refused": what to do when one after the first is
                            refused (plan resume-pending).
                            Operations: ${plannedOperations().join(', ')}`;

export async function main(argv) {
  const args = [...argv];
  const opt = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    return args.splice(i, 2)[1];
  };
  const dataDir = opt('--data');
  const cycle = opt('--cycle');
  const since = opt('--since');
  const category = opt('--category');
  const snapshot = opt('--snapshot');
  const versions = opt('--versions');
  const out = opt('--out');
  const pointer = opt('--pointer');
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i !== -1) args.splice(i, 1);
    return i !== -1;
  };
  const retracted = flag('--retracted');
  const insist = flag('--insist');
  const tracker = flag('--tracker');
  const [op, ...rest] = args;
  const stdin = () => fs.readFileSync(0, 'utf8');

  try {
    if (op === 'boot') {
      process.stdout.write(boot({ dataDir, route: rest[0], tracker }));
      return 0;
    }
    if (op === 'reads') {
      const [planned, ...args] = rest;
      const reads = readsFor({ op: planned, args, input: stdin, snapshot });
      process.stdout.write(`{"reads": [\n${reads.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
      return 0;
    }
    if (op === 'plan') {
      const [planned, ...args] = rest;
      const plan = planOperation({ snapshot, versions, out, op: planned, args, input: stdin, insist, since, retracted, category, pointer });
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    const store = openStore({ dataDir, cycle });
    if (!isOperation(op)) {
      process.stderr.write(`${USAGE}\n`);
      return 2;
    }
    const result = runOperation(store, op, { args: rest, input: stdin, since, retracted, insist, category });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
}
