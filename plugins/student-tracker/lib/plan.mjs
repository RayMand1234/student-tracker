// The artifact backend's plan step: one store operation run over a snapshot of the documents it
// reads, giving the writes to send as `ArtifactData` `batch` calls instead of applying them.
import fs from 'node:fs';
import path from 'node:path';
import { openStore, StoreError } from './store.mjs';
import { openSnapshot, checkBatch, getRead, listRead, queryRead, readKey, MissingReads } from './docs.mjs';
import { runOperation } from './operations.mjs';
import { parseEntry, parseAssessments, parseNextTalk, parseSnapshot } from './payload.mjs';

// What every write to the Cycle checks against: the Cycle, its Tests and Projects, its Skills, its teams.
const CYCLE_READS = [getRead('meta/cycle'), getRead('meta/preset'), getRead('meta/skills'), listRead('teams')];

// What one Trainee's card is derived from: the card, its records and its sensitive records.
const traineeReads = (tid) => [
  getRead(`trainees/${tid}`),
  ...['evidence', 'followups', 'items', 'assessments', 'changes'].map((kind) => listRead(`trainees/${tid}/${kind}`)),
  queryRead('sensitive', [['trainee', '==', tid]]),
];

// Records outside an Entry, Retraction, Hard delete and resume (lean-turns 05). An Entry's
// Trainees are known only once the Entry is read, so these name the Entry reads; planning then
// asks for the Trainees' reads as "missing reads".
const tidOf = (parse) => ({ input }) => parse(input()).trainee;
const RECORD_AND_UNDO = {
  'record-assessments': { reads: (a) => [getRead('meta/cycle'), getRead('meta/skills'), ...traineeReads(tidOf(parseAssessments)(a))] },
  'record-next-talk': { reads: (a) => [getRead('meta/cycle'), ...traineeReads(tidOf(parseNextTalk)(a))] },
  'record-snapshot': { reads: (a) => [getRead('meta/cycle'), ...traineeReads(tidOf(parseSnapshot)(a))] },
  // The record's id names its Entry (`<entry id>-<n>`), and the Entry names its Trainees.
  'flip-sensitive': { reads: ({ args }) => [getRead('meta/cycle'), getRead(`sensitive/${args[0]}`), getRead(`entries/${String(args[0]).replace(/-\d+$/, '')}`)] },
  'retract-entry': { reads: () => [getRead('meta/cycle'), listRead('entries')] },
  'hard-delete': { reads: () => [getRead('meta/cycle'), listRead('entries')] },
  'resume-pending': { reads: () => [getRead('meta/cycle'), listRead('entries')] },
};

// Reads, status, Playbook selection and alerts (lean-turns 04). A read plans to no batches; its
// result is the plan's result. Reads of an archived Cycle are the same reads, sent to its address.
// What team status and alerts are computed from: the cards, the Cycle, its Skills, the Talk settings.
const STATUS_READS = [listRead('trainees'), getRead('meta/cycle'), getRead('meta/skills'), getRead('commander/settings')];
const READ_OPERATIONS = {
  'read-cycle': {
    reads: () => [
      ...['meta/cycle', 'meta/skills', 'meta/preset', 'commander/settings', 'commander/hides'].map(getRead),
      listRead('playbook'), listRead('teams'),
    ],
  },
  'read-team': { reads: () => [listRead('trainees')] },
  'read-trainee': { reads: ({ args }) => [...traineeReads(args[0]), listRead('entries')] },
  'read-playbook': {
    reads: ({ args }) => [getRead(`trainees/${args[0]}`), getRead('meta/skills'), listRead('playbook'), getRead('commander/hides')],
  },
  'read-status': { reads: () => STATUS_READS },
  // Writes `meta/alerts` when an alert is due. A pattern's Trainee is among the cards.
  'take-alert': { reads: () => [...STATUS_READS, getRead('meta/alerts')] },
  // Writes the card when it is out of step with its records. meta/cycle: no write to an archived Cycle.
  'rebuild-card': { reads: ({ args }) => [getRead('meta/cycle'), ...traineeReads(args[0])] },
};

// The operations the plan step runs, each with its reads manifest: from the operation's
// arguments and payload (`input()`), the reads it needs, each one `ArtifactData` call (getRead,
// listRead, queryRead). Planning over a snapshot that lacks one of them refuses and names it.
const PLANNED = {
  'record-entry': {
    reads: ({ input }) => {
      const { evidence, assessments, items, changes } = parseEntry(input());
      const trainees = [...evidence, ...assessments, ...items, ...changes].map((r) => r.trainee);
      return [...CYCLE_READS, ...[...new Set(trainees)].flatMap(traineeReads)];
    },
  },
  ...RECORD_AND_UNDO,

  // Reads, status, Playbook selection and alerts (lean-turns 04). A read plans to no batches.
  ...READ_OPERATIONS,
};

export const plannedOperations = () => Object.keys(PLANNED);

function planned(op) {
  if (!Object.hasOwn(PLANNED, op)) throw new StoreError(`plan runs ${Object.keys(PLANNED).join(', ')}; got "${op ?? ''}"`);
  return PLANNED[op];
}

// The reads manifest: the reads `op` needs for these arguments and payload, each once.
// `snapshot`: the folder the reads save into; each read then carries it as `out_dir`, a full long path.
export function readsFor({ op, args = [], input = '', snapshot }) {
  const payload = typeof input === 'function' ? input : () => input;
  const seen = new Set();
  const reads = planned(op).reads({ args, input: payload }).filter((r) => !seen.has(readKey(r)) && seen.add(readKey(r)));
  if (!snapshot) return reads;
  fs.mkdirSync(snapshot, { recursive: true });
  const outDir = fs.realpathSync.native(snapshot);
  return reads.map((r) => ({ ...r, out_dir: outDir }));
}

// `snapshot`: the folder the reads saved with `out_dir`. `versions`: a file listing the reads made
// and each read document's version (see readList). `out`: a fresh folder for the plan.
// Gives {result, plan, batches}: the operation's result, the plan folder (full long path) and
// the batches in order, each a list of `batch` writes {op, collection, doc_id, file_path, if_version?}.
// A plan of several batches also gives `if_refused` (IF_REFUSED).
// Refuses with MissingReads when the operation needed a read the list does not hold.
export function planOperation({ snapshot, versions, out, op, args = [], input = '', insist = false, since, retracted = false, category, now, rand }) {
  planned(op);
  if (!snapshot || !out) throw new StoreError('plan needs --snapshot <folder> and --out <folder>');
  if (!fs.existsSync(snapshot)) throw new StoreError(`no snapshot folder ${snapshot}`);
  const list = versions ? readList(versions, snapshot) : { versions: new Map(), reads: new Set() };
  // The payload is read once (it may be stdin), for the manifest and for the operation.
  let text;
  const payload = () => (text ??= typeof input === 'function' ? input() : input);
  // Every read the manifest names is made first; reads it could not foresee are named as the run meets them.
  const unmade = readsFor({ op, args, input: payload }).filter((r) => !list.reads.has(readKey(r)));
  if (unmade.length) throw new MissingReads(unmade);
  const docs = openSnapshot(snapshot, list.versions, list.reads);
  const store = openStore({ docs, ...(now ? { now } : {}), ...(rand ? { rand } : {}) });
  let result;
  try {
    result = runOperation(store, op, { args, input: payload, insist, since, retracted, category });
  } catch (e) {
    // It ran on documents it never got, so whatever went wrong after that is no answer.
    if (docs.missing().length) throw new MissingReads(docs.missing());
    throw e;
  }
  if (docs.missing().length) throw new MissingReads(docs.missing());

  const folded = docs.writes().flatMap(toWrite);
  if (!folded.length) return { result, plan: null, batches: [] };
  // One pinned, all-or-nothing batch when everything fits in one. Otherwise the batches the store
  // sent, in order (ADR 0002: the Entry or mark at `writing`, one batch per Trainee, then the
  // close), each pinned to the versions the batches before it leave.
  const sends = fits(folded) ? [folded] : docs.steps().map((step) => step.flatMap(toWrite));

  fs.mkdirSync(out, { recursive: true });
  const dir = fs.realpathSync.native(out);
  const batches = sends.map((writes, k) => writes.map((w) => {
    const slash = w.path.lastIndexOf('/');
    const entry = { op: w.op, collection: w.path.slice(0, slash), doc_id: w.path.slice(slash + 1) };
    if (w.data) {
      const file = path.join(dir, `batch-${k + 1}`, `${w.path}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(w.data, null, 2)}\n`);
      entry.file_path = file;
    }
    if (w.ifVersion !== undefined) entry.if_version = w.ifVersion;
    return entry;
  }));
  fs.writeFileSync(path.join(dir, 'plan.json'), `${JSON.stringify({ batches }, null, 2)}\n`);
  return { result, plan: dir, batches, ...(batches.length > 1 ? { if_refused: IF_REFUSED } : {}) };
}

// What to do when a batch of a plan of several is refused: the batches before it stand, and the
// first one left a mark at `writing` that resume-pending finishes.
export const IF_REFUSED = 'batch 1 refused: nothing was written; read again, plan again, send again. A later batch refused: the batches before it stand; read again for resume-pending, plan it and send its batches.';

function fits(writes) {
  try {
    checkBatch(writes.map((w) => ({ path: w.path, data: w.data })));
    return true;
  } catch {
    return false;
  }
}

// A document's writes folded into the one write that takes it from its state before (the
// snapshot's, or what earlier batches left) to its final one: a create is a `set` with no pin; a
// change or delete pins the version before.
function toWrite({ path: p, before, after }) {
  if (!before && !after) return [];
  if (!after) return [{ op: 'delete', path: p, ifVersion: before.version }];
  return [{ op: 'set', path: p, data: after.data, ...(before ? { ifVersion: before.version } : {}) }];
}

// The document path a file saved under the snapshot folder stands for, or null when it lies
// elsewhere. Both are compared as full long paths (a read prints the long spelling).
function docPathIn(snapshot, file) {
  const long = (p) => {
    const abs = path.resolve(p);
    return fs.existsSync(abs) ? fs.realpathSync.native(abs) : abs;
  };
  const rel = path.relative(long(snapshot), long(file));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.slice(0, -'.json'.length).split(path.sep).join('/');
}

// The versions list: the reads made, and the versions of the documents they found. One line per
// read made, its JSON as the manifest printed it (a get that found nothing is still a read made),
// and one per document found, either "<collection path>/<doc id> <version>" or a line of an
// `out_dir` read's result as the tool printed it (`… version 2  "<file path>"`).
// Gives {versions: doc path → version, reads: the reads' keys (readKey)}.
export function readList(file, snapshot) {
  const versions = new Map();
  const reads = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('{')) {
      let read;
      try {
        read = JSON.parse(line);
      } catch {
        throw new StoreError(`unreadable read line "${line}": copy the read's JSON as the manifest printed it`);
      }
      reads.add(readKey(read));
      continue;
    }
    const plain = line.match(/^([^\s"]+)\s+(\d+)$/);
    if (plain) {
      versions.set(plain[1], Number(plain[2]));
      continue;
    }
    const printed = line.match(/\bversion\s+(\d+)\s+"([^"]+\.json)"\s*$/);
    const docPath = printed && docPathIn(snapshot, printed[2]);
    if (docPath) {
      versions.set(docPath, Number(printed[1]));
      continue;
    }
    throw new StoreError(`unreadable versions line "${line}": give "<collection path>/<doc id> <version>"`);
  }
  return { versions, reads };
}

export const readVersions = (file, snapshot) => readList(file, snapshot).versions;
