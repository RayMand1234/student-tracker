import fs from 'node:fs';
import { openStore, StoreError } from './store.mjs';
import { parseCycle, parseEntry } from './payload.mjs';

const USAGE = `usage: student-tracker-store --data <plugin data dir> <operation> [args]
  connect
  create-cycle            < lines "commander: <name>", "cycle: <name>", "trainee: <name>" (repeat)
  read-cycle
  read-team
  read-trainee <tid> [--since YYYY-MM-DD]
  record-entry            < "--- entry" + message, then per Evidence "--- evidence <tid> <kind> <date>" + excerpt
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
  const [op, ...rest] = args;
  const stdin = () => fs.readFileSync(0, 'utf8');

  try {
    const store = openStore({ dataDir });
    const ops = {
      connect: () => store.connect(),
      'create-cycle': () => store.createCycle(parseCycle(stdin())),
      'read-cycle': () => store.readCycle(),
      'read-team': () => store.readTeam(),
      'read-trainee': () => store.readTrainee(rest[0], { since }),
      'record-entry': () => store.recordEntry(parseEntry(stdin())),
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
