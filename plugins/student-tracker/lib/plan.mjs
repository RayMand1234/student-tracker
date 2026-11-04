// The artifact backend's plan step: one store operation run over a snapshot of the documents it
// reads, giving the writes to send as `ArtifactData` `batch` calls instead of applying them.
import fs from 'node:fs';
import path from 'node:path';
import { openStore, StoreError } from './store.mjs';
import { openSnapshot, checkBatch } from './docs.mjs';
import { runOperation } from './operations.mjs';

// The operations the plan step runs so far.
const PLANNED = new Set(['record-entry']);

// `snapshot`: the folder the reads saved with `out_dir`. `versions`: a file listing each read
// document's version (see readVersions). `out`: a fresh folder for the plan.
// Gives {result, plan, batches}: the operation's result, the plan folder (full long path) and
// the batches in order, each a list of `batch` writes {op, collection, doc_id, file_path, if_version?}.
export function planOperation({ snapshot, versions, out, op, args = [], input = '', insist = false, now, rand }) {
  if (!PLANNED.has(op)) throw new StoreError(`plan runs ${[...PLANNED].join(', ')}; got "${op ?? ''}"`);
  if (!snapshot || !out) throw new StoreError('plan needs --snapshot <folder> and --out <folder>');
  if (!fs.existsSync(snapshot)) throw new StoreError(`no snapshot folder ${snapshot}`);
  const docs = openSnapshot(snapshot, versions ? readVersions(versions, snapshot) : new Map());
  const store = openStore({ docs, ...(now ? { now } : {}), ...(rand ? { rand } : {}) });
  const result = runOperation(store, op, { args, input, insist });

  const writes = docs.writes().flatMap(toWrite);
  if (!writes.length) return { result, plan: null, batches: [] };
  // One pinned, all-or-nothing batch. An Entry too big for one is ADR 0002's chunked write, not planned yet.
  checkBatch(writes.map((w) => ({ path: w.path, data: w.data })));

  fs.mkdirSync(out, { recursive: true });
  const dir = fs.realpathSync.native(out);
  const batch = writes.map((w) => {
    const slash = w.path.lastIndexOf('/');
    const entry = { op: w.op, collection: w.path.slice(0, slash), doc_id: w.path.slice(slash + 1) };
    if (w.data) {
      const file = path.join(dir, 'batch-1', `${w.path}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(w.data, null, 2)}\n`);
      entry.file_path = file;
    }
    if (w.ifVersion !== undefined) entry.if_version = w.ifVersion;
    return entry;
  });
  const batches = [batch];
  fs.writeFileSync(path.join(dir, 'plan.json'), `${JSON.stringify({ batches }, null, 2)}\n`);
  return { result, plan: dir, batches };
}

// A document's writes folded into the one write that takes it from its snapshot state to its
// final one: a create is a `set` with no pin; a change or delete pins the snapshot's version.
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

// The versions list: one line per document, either "<collection path>/<doc id> <version>" or a
// line of an `out_dir` read's result as the tool printed it (`… version 2  "<file path>"`).
export function readVersions(file, snapshot) {
  const versions = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
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
  return versions;
}
