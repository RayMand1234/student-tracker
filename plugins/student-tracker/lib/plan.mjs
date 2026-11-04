// The artifact backend's plan step: one store operation run over a snapshot of the documents it
// reads, giving the writes to send as `ArtifactData` `batch` calls instead of applying them.
import fs from 'node:fs';
import path from 'node:path';
import { openStore, StoreError } from './store.mjs';
import { openSnapshot, checkBatch, getRead, listRead, queryRead, readKey, MissingReads } from './docs.mjs';
import { runOperation } from './operations.mjs';
import { parseEntry, parseAssessments, parseNextTalk, parseSnapshot, parseTraineeChange, parseCycleChange, parsePlaybookItem, parseCycle } from './payload.mjs';

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
  'retract-entry': { resume: true, reads: () => [getRead('meta/cycle'), listRead('entries')] },
  'hard-delete': { resume: true, reads: () => [getRead('meta/cycle'), listRead('entries')] },
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
    resume: true,
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

// Roster, settings, Playbook and Cycle lifecycle (lean-turns 06).
Object.assign(PLANNED, {
  'update-settings': { reads: () => [getRead('meta/cycle'), getRead('commander/settings')] },
  // Adding and renaming check the name against every Trainee's; a change rebuilds the card.
  'update-trainee': {
    reads: ({ args: [tid], input }) => {
      const kind = Object.keys(parseTraineeChange(input()))[0];
      const names = ['add', 'rename'].includes(kind) ? [listRead('trainees')] : [];
      return [getRead('meta/cycle'), ...names, ...(kind === 'add' ? [] : traineeReads(tid))];
    },
  },
  'update-cycle': {
    reads: ({ input }) => {
      const [[kind, change]] = Object.entries(parseCycleChange(input()));
      if (['addSkill', 'archiveSkill', 'restoreSkill'].includes(kind)) return [getRead('meta/cycle'), getRead('meta/skills')];
      const teams = ['removeProject', 'setTeam'].includes(kind) ? [listRead('teams')] : [];
      const members = kind === 'setTeam' ? change.members.map((tid) => getRead(`trainees/${tid}`)) : [];
      return [getRead('meta/cycle'), getRead('meta/preset'), ...teams, ...members];
    },
  },
  // A new item takes a free id (a list of the Playbook); one taken from an Entry is checked
  // against that Entry and its sensitive parts.
  'save-playbook-item': {
    reads: ({ args: [id], input }) => {
      if (id) return [getRead('meta/cycle'), getRead('meta/skills'), getRead(`playbook/${id}`)];
      const { source } = parsePlaybookItem(input());
      const from = source ? [getRead(`entries/${source}`), queryRead('sensitive', [['entry', '==', source]])] : [];
      return [getRead('meta/cycle'), getRead('meta/skills'), listRead('playbook'), ...from];
    },
  },
  'retire-playbook-item': { reads: ({ args: [id] }) => [getRead('meta/cycle'), getRead(`playbook/${id}`)] },
  // Hiding checks the item against the base Playbook of the Cycle's Skills.
  'hide-playbook-item': { reads: () => [getRead('meta/cycle'), getRead('meta/skills'), getRead('commander/hides')] },
  'unhide-playbook-item': { reads: () => [getRead('meta/cycle'), getRead('commander/hides')] },
  'finish-setup': { reads: () => [getRead('meta/cycle')] },
});

// A turn's first step (lean-turns 07): connect, resumePending, readCycle and readTeam over one
// snapshot, so the turn sends one read message. Reads the pointer for the Cycle's address.
const READ_CYCLE = READ_OPERATIONS['read-cycle'].reads;
Object.assign(PLANNED, {
  start: { pointer: true, reads: () => [...READ_CYCLE(), listRead('entries'), listRead('trainees')] },
});

// The Cycle lifecycle (lean-turns 06): operations on two Cycles. Each reads the pointer file
// (`pointer`). `from`: the other Cycle it reads, whose reads carry its address as `url` and
// save into the second snapshot. `target`: the Cycle it writes to when that is not the current one.
const atUrl = (url, reads) => reads.map((r) => ({ ...r, url }));
const SCOPE = ['commander/settings', 'meta/skills', 'commander/hides'];
Object.assign(PLANNED, {
  // Settings, Skills, items and hides of the previous Cycle, copied into the new one.
  'copy-commander-scope': {
    pointer: true,
    from: ({ args: [url] }) => url,
    reads: ({ args: [url] }) => {
      const scope = [getRead('meta/cycle'), ...SCOPE.map(getRead), listRead('playbook')];
      return [...scope, ...atUrl(url, scope)];
    },
  },
  // Seeds the current Cycle: setup has published its page and written the pointer, current =
  // the page. A new Cycle reads the previous one: is it done, and its settings to start from.
  'create-cycle': {
    pointer: true,
    from: ({ input }) => parseCycle(input()).previous,
    reads: ({ input }) => {
      const { previous } = parseCycle(input());
      const here = [...['meta/cycle', 'meta/skills', 'meta/preset', 'commander/settings', 'commander/hides'].map(getRead), listRead('trainees')];
      return [...here, ...(previous ? atUrl(previous, [getRead('meta/cycle'), getRead('commander/settings')]) : [])];
    },
  },
  // Writes to the archived Cycle itself: its Entries left at `writing` are finished (the reads
  // their records need are named as missing reads), then its meta/cycle is marked archived.
  'archive-cycle': {
    pointer: true,
    target: ({ args: [url] }) => url,
    reads: ({ args: [url] }) => atUrl(url, [getRead('meta/cycle'), listRead('entries')]),
  },
});

export const plannedOperations = () => Object.keys(PLANNED);

function planned(op) {
  if (!Object.hasOwn(PLANNED, op)) throw new StoreError(`plan runs ${Object.keys(PLANNED).join(', ')}; got "${op ?? ''}"`);
  return PLANNED[op];
}

// The reads manifest: the reads `op` needs for these arguments and payload, each once.
// `snapshot`: the folder the reads save into; each read then carries it as `out_dir`, a full long path.
// A read of another Cycle (one with a `url` other than the operation's target) saves into that
// folder's OTHER subfolder instead: the second snapshot.
export function readsFor({ op, args = [], input = '', snapshot }) {
  const payload = typeof input === 'function' ? input : () => input;
  const entry = planned(op);
  const target = entry.target?.({ args, input: payload });
  const seen = new Set();
  const key = (r) => `${r.url ?? ''} ${readKey(r)}`;
  const reads = entry.reads({ args, input: payload }).filter((r) => !seen.has(key(r)) && seen.add(key(r)));
  if (!snapshot) return reads;
  const isOther = (r) => r.url !== undefined && r.url !== target;
  return reads.map((r) => ({ ...r, out_dir: longDir(isOther(r) ? otherSnapshot(snapshot) : snapshot) }));
}

// The second snapshot, of another Cycle than the one the plan writes to: a subfolder of the
// snapshot that no collection is named.
export const OTHER = '@other';
export const otherSnapshot = (snapshot) => path.join(snapshot, OTHER);

function longDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return fs.realpathSync.native(dir);
}

function readPointerFile(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new StoreError(`unreadable pointer file ${file}`);
  }
}

// `snapshot`: the folder the reads saved with `out_dir`. `versions`: a file listing the reads made
// and each read document's version (see readList). `out`: a fresh folder for the plan.
// Gives {result, plan, batches}: the operation's result, the plan folder (full long path) and
// the batches in order, each a list of `batch` writes {op, collection, doc_id, file_path, if_version?}.
// A plan of several batches of an operation that leaves a mark at `writing` (`resume`: an Entry,
// a Retraction, a Hard delete) also gives `if_refused` (IF_REFUSED). Any other plan cut off
// after some of its batches is finished by reading, planning and sending it again.
// Refuses with MissingReads when the operation needed a read the list does not hold.
// `pointer`: the pointer file, read only. The plan never writes it: when the operation changes
// it, the plan gives `pointer`, the whole file to write before sending the batches. Another
// Cycle the operation reads (createCycle's previous, copyCommanderScope's source, the current
// Cycle a refused write on an archived one names) is read from the second snapshot
// (otherSnapshot). An operation with a `target` writes to that address, not the current
// Cycle: the plan then gives it as `url`, where the batches go.
// `cycle`: the address the snapshot was read from when it is an archived Cycle (--cycle), as on
// the local backend: reads run, and every write is refused unless it is the pointer's current.
export function planOperation({ snapshot, versions, out, op, args = [], input = '', insist = false, since, retracted = false, category, pointer, cycle, now, rand }) {
  const entry = planned(op);
  if (!snapshot || !out) throw new StoreError('plan needs --snapshot <folder> and --out <folder>');
  if (!fs.existsSync(snapshot)) throw new StoreError(`no snapshot folder ${snapshot}`);
  if (entry.pointer && !pointer) throw new StoreError(`plan ${op} needs --pointer <the pointer file>`);
  const shown = pointer ? { current: null, archived: [], ...readPointerFile(pointer) } : undefined;
  // The payload is read once (it may be stdin), for the manifest and for the operation.
  let text;
  const payload = () => (text ??= typeof input === 'function' ? input() : input);
  const target = entry.target?.({ args, input: payload });
  const list = versions
    ? readList(versions, snapshot, { main: [target, cycle, shown?.current] })
    : { versions: new Map(), reads: new Set(), more: new Map(), other: { versions: new Map(), reads: new Set(), more: new Map() } };
  const isOther = (r) => r.url !== undefined && r.url !== target;
  // Every read to make saves into its snapshot folder: the second one for another Cycle's. A
  // list or query with a page still unread is asked for again from that page (its cursor).
  const nextPage = (side, r) => (side.more.has(readKey(r)) ? { ...r, query: { ...r.query, cursor: side.more.get(readKey(r)) } } : r);
  const toOther = (r) => ({ ...nextPage(list.other, r), out_dir: longDir(otherSnapshot(snapshot)) });
  const toMain = (r) => ({ ...nextPage(list, r), out_dir: longDir(snapshot) });
  // Every read the manifest names is made first; reads it could not foresee are named as the run meets them.
  const unmade = readsFor({ op, args, input: payload }).filter((r) => !(isOther(r) ? list.other.reads : list.reads).has(readKey(r)));
  if (unmade.length) throw new MissingReads(unmade.map((r) => (isOther(r) ? toOther(r) : toMain(r))));
  const docs = openSnapshot(snapshot, list.versions, list.reads);
  // The one other Cycle a run may read: the operation's own (`from`), else the first it asks for.
  let otherUrl = entry.from?.({ args, input: payload }) ?? list.other.url;
  let other;
  const cycles = (url) => {
    if (url === target) return docs;
    otherUrl ??= url;
    if (url !== otherUrl) throw new StoreError(`planning reads one other Cycle (${otherUrl}), not also ${url}`);
    other ??= openSnapshot(otherSnapshot(snapshot), list.other.versions, list.other.reads);
    return other;
  };
  const missing = () => [
    ...docs.missing().map((r) => toMain(target ?? cycle ? { ...r, url: target ?? cycle } : r)),
    ...(other?.missing() ?? []).map((r) => toOther({ ...r, url: otherUrl })),
  ];
  let pointerWrite;
  const store = openStore({
    docs,
    cycles,
    ...(cycle ? { cycle } : {}),
    ...(shown ? { pointer: shown, writePointer: (next) => (pointerWrite = next) } : {}),
    ...(now ? { now } : {}),
    ...(rand ? { rand } : {}),
  });
  let result;
  try {
    result = runOperation(store, op, { args, input: payload, insist, since, retracted, category });
  } catch (e) {
    // It ran on documents it never got, so whatever went wrong after that is no answer.
    if (missing().length) throw new MissingReads(missing());
    throw e;
  }
  if (missing().length) throw new MissingReads(missing());
  // Where the batches go and the pointer to write first, when either is not as usual.
  const extra = { ...(target ? { url: target } : {}), ...(pointerWrite ? { pointer: pointerWrite } : {}) };

  const folded = docs.writes().flatMap(toWrite);
  if (!folded.length) return { result, plan: null, batches: [], ...extra };
  // One pinned, all-or-nothing batch when everything fits in one. Otherwise the batches the store
  // sent, in order (ADR 0002: the Entry or mark at `writing`, one batch per Trainee, then the
  // close), each pinned to the versions the batches before it leave.
  const sends = fits(folded) ? [folded] : docs.steps().map((step) => step.flatMap(toWrite));

  fs.mkdirSync(out, { recursive: true });
  const dir = fs.realpathSync.native(out);
  const batches = sends.map((writes, k) => writes.map((w) => {
    const slash = w.path.lastIndexOf('/');
    const sent = { op: w.op, collection: w.path.slice(0, slash), doc_id: w.path.slice(slash + 1) };
    if (w.data) {
      const file = path.join(dir, `batch-${k + 1}`, `${w.path}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(w.data, null, 2)}\n`);
      sent.file_path = file;
    }
    if (w.ifVersion !== undefined) sent.if_version = w.ifVersion;
    return sent;
  }));
  fs.writeFileSync(path.join(dir, 'plan.json'), `${JSON.stringify({ batches }, null, 2)}\n`);
  return { result, plan: dir, batches, ...(batches.length > 1 && entry.resume ? { if_refused: IF_REFUSED } : {}), ...extra };
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
// `out_dir` read's result as the tool printed it (`… version 2  "<file path>"`). A list or query
// whose result gave a `next_cursor` has another page: that line as printed (`next_cursor: "…"`)
// follows the read's lines, and the next page is a read of its own, with that `cursor`.
// Gives {versions: doc path → version, reads: the reads' keys (readKey), more: read key → the
// cursor of its first page not yet read}. A read with a page left is not a read made.
// Reads of another Cycle, and the versions they show, go to `other` ({versions, reads, more, url}):
// a read line whose `out_dir` is the second snapshot (otherSnapshot), or with no `out_dir` and a
// `url` that is none of `main` (the addresses of the Cycle the plan writes to); a printed
// result line of a file in the second snapshot; a plain line after a read of another Cycle.
// A page that came back full with no `next_cursor` line after it is refused: more may exist.
export function readList(file, snapshot, { main = [] } = {}) {
  const side = () => ({ versions: new Map(), reads: new Set(), more: new Map(), pages: new Map() });
  const here = side();
  const other = { ...side(), url: undefined };
  const otherDir = otherSnapshot(snapshot);
  const inOther = (dir) => docPathIn(otherDir, path.join(dir, 'x.json')) !== null;
  let last = here; // the Cycle of the last read line: a plain version line belongs to it
  let page = null; // the last read line's page: {line, read, key, found, next}
  const close = () => {
    if (!page || page.read.action === 'get' || page.next !== undefined) return;
    if (page.found >= (page.read.query?.limit ?? 100)) {
      throw new StoreError(`the read ${page.line} came back full (${page.found} documents): add the next_cursor line its result gave after its lines in the versions list`);
    }
  };
  for (const line of fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('{')) {
      let read;
      try {
        read = JSON.parse(line);
      } catch {
        throw new StoreError(`unreadable read line "${line}": copy the read's JSON as the manifest printed it`);
      }
      close();
      const isOther = read.out_dir !== undefined ? inOther(read.out_dir) : read.url !== undefined && !main.includes(read.url);
      last = isOther ? other : here;
      if (isOther) other.url ??= read.url;
      const key = readKey(read);
      if (!last.pages.has(key)) last.pages.set(key, { made: new Set(), next: new Set() });
      last.pages.get(key).made.add(read.query?.cursor ?? '');
      page = { line, read, key, found: 0, next: undefined };
      continue;
    }
    const cursor = line.match(/^\W*next_cursor\W+(.*?)[\s",}]*$/);
    if (cursor) {
      if (!page) throw new StoreError(`next_cursor line "${line}" with no read line before it`);
      page.next = ['', 'null', 'none'].includes(cursor[1]) ? null : cursor[1];
      if (page.next !== null) last.pages.get(page.key).next.add(page.next);
      continue;
    }
    const plain = line.match(/^([^\s"]+)\s+(\d+)$/);
    if (plain) {
      last.versions.set(plain[1], Number(plain[2]));
      if (page) page.found += 1;
      continue;
    }
    const printed = line.match(/\bversion\s+(\d+)\s+"([^"]+\.json)"\s*$/);
    const otherPath = printed && docPathIn(otherDir, printed[2]);
    const docPath = printed && !otherPath && docPathIn(snapshot, printed[2]);
    if (otherPath || docPath) {
      (otherPath ? other : here).versions.set(otherPath || docPath, Number(printed[1]));
      if (page) page.found += 1;
      continue;
    }
    throw new StoreError(`unreadable versions line "${line}": give "<collection path>/<doc id> <version>"`);
  }
  close();
  for (const s of [here, other]) {
    for (const [key, { made, next }] of s.pages) {
      const left = [...next].find((c) => !made.has(c));
      if (left === undefined) s.reads.add(key);
      else s.more.set(key, left);
    }
    delete s.pages;
  }
  return { ...here, other };
}

export const readVersions = (file, snapshot) => readList(file, snapshot).versions;
