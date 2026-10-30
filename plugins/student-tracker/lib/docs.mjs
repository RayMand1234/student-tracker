// Document layer of the local backend. Emulates the artifact database's write rules so the
// protocol built on top behaves the same on both backends:
//   - a create on an existing id is refused
//   - a write to an existing document must pin the version it last read (if_version)
//   - a batch is 1–50 writes, each document at most once, ≤1 MiB
//   - a batch with any pinned write is checked whole before anything is applied, so a refusal
//     writes nothing; a batch with no pinned write applies in order and stops at the first
//     refusal, keeping what it already wrote
// A crash in the middle of applying can still leave a partial batch, as on the server.
// Files: <root>/<collection path>/<doc id>.json holding {version, data}.
import fs from 'node:fs';
import path from 'node:path';

export const MAX_BATCH_WRITES = 50;
export const MAX_BATCH_BYTES = 1024 * 1024;
const MAX_DOC_BYTES = 256 * 1024;

export class StoreError extends Error {}

export class AlreadyExists extends StoreError {
  constructor(docPath) {
    super(`${docPath} already exists`);
    this.path = docPath;
  }
}

export class VersionConflict extends StoreError {
  constructor(docPath, current) {
    super(`version conflict on ${docPath}: current version is ${current}`);
    this.path = docPath;
    this.current = current;
  }
}

export function openDocs(root) {
  const file = (docPath) => path.join(root, `${docPath}.json`);
  const read = (docPath) => {
    const f = file(docPath);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  };

  // Check one write against the current state; returns what applying it will store.
  function check(w) {
    const current = read(w.path);
    if (w.op === 'create') {
      if (current) throw new AlreadyExists(w.path);
      return sized({ ...w, next: { version: 1, data: w.data } });
    }
    if (!current) throw new StoreError(`${w.path} does not exist`);
    if (w.ifVersion === undefined) throw new StoreError(`${w.op} on ${w.path} needs if_version`);
    if (w.ifVersion !== current.version) throw new VersionConflict(w.path, current.version);
    if (w.op === 'delete') return w;
    const data = w.op === 'update' ? { ...current.data, ...w.data } : w.data;
    return sized({ ...w, next: { version: current.version + 1, data } });
  }

  function sized(p) {
    if (Buffer.byteLength(JSON.stringify(p.next.data)) > MAX_DOC_BYTES) throw new StoreError(`${p.path} would exceed 256 KiB`);
    return p;
  }

  function apply(p) {
    if (p.op === 'delete') {
      fs.rmSync(file(p.path));
      return { path: p.path, version: null };
    }
    fs.mkdirSync(path.dirname(file(p.path)), { recursive: true });
    const tmp = `${file(p.path)}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(p.next, null, 2)}\n`);
    fs.renameSync(tmp, file(p.path));
    return { path: p.path, version: p.next.version };
  }

  return {
    get(docPath) {
      return read(docPath);
    },

    // Documents directly in a collection (not its subcollections), sorted by id.
    list(collection) {
      const dir = path.join(root, collection);
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => ({ id: f.slice(0, -5), ...read(`${collection}/${f.slice(0, -5)}`) }));
    },

    // writes: [{op: 'create' | 'set' | 'update' | 'delete', path, data?, ifVersion?}]
    batch(writes) {
      if (writes.length < 1 || writes.length > MAX_BATCH_WRITES) {
        throw new StoreError(`a batch holds 1–${MAX_BATCH_WRITES} writes, got ${writes.length}`);
      }
      const paths = writes.map((w) => w.path);
      const twice = paths.find((p, i) => paths.indexOf(p) !== i);
      if (twice) throw new StoreError(`${twice} appears twice in one batch`);
      const bytes = writes.reduce((n, w) => n + Buffer.byteLength(JSON.stringify(w.data ?? null)), 0);
      if (bytes > MAX_BATCH_BYTES) throw new StoreError(`batch is ${bytes} bytes, over 1 MiB`);

      if (writes.some((w) => w.ifVersion !== undefined)) return writes.map(check).map(apply);
      return writes.map((w) => apply(check(w)));
    },
  };
}
