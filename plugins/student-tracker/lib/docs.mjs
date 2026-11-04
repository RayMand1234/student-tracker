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

// The local docs layer: files under `root`.
export function openDocs(root) {
  const file = (docPath) => path.join(root, `${docPath}.json`);
  return docsOver({
    read(docPath) {
      const f = file(docPath);
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    },
    ids(collection) {
      const dir = path.join(root, collection);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    },
    write(docPath, next) {
      fs.mkdirSync(path.dirname(file(docPath)), { recursive: true });
      const tmp = `${file(docPath)}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}
`);
      fs.renameSync(tmp, file(docPath));
    },
    remove(docPath) {
      fs.rmSync(file(docPath));
    },
  });
}

// The snapshot docs layer of the artifact backend's plan step. `dir` is in the layout `out_dir`
// reads save: <collection path>/<doc id>.json holding the document's data only. `versions` maps a
// document path to the version its read showed. Writes run under the database's rules against
// the snapshot plus the writes before them, so a later read sees them, but nothing is written to
// `dir`: `writes()` gives what was written, per document in first-write order, as
// {path, before: {version} | null, after: {version, data} | null}.
export function openSnapshot(dir, versions = new Map()) {
  const file = (docPath) => path.join(dir, `${docPath}.json`);
  const written = new Map(); // doc path → {version, data} | null (deleted)
  const base = (docPath) => {
    const f = file(docPath);
    if (!fs.existsSync(f)) return null;
    return { version: versions.get(docPath), data: JSON.parse(fs.readFileSync(f, 'utf8')) };
  };
  const read = (docPath) => (written.has(docPath) ? written.get(docPath) : base(docPath));
  const docs = docsOver({
    read,
    ids(collection) {
      const d = path.join(dir, collection);
      const onDisk = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
      const inPlan = [...written.keys()].filter((p) => p.startsWith(`${collection}/`) && !p.slice(collection.length + 1).includes('/'));
      return [...new Set([...onDisk, ...inPlan.map((p) => p.slice(collection.length + 1))])].filter((id) => read(`${collection}/${id}`));
    },
    write(docPath, next) {
      written.set(docPath, next);
    },
    remove(docPath) {
      written.set(docPath, null);
    },
  });
  return {
    ...docs,
    batch(writes) {
      for (const w of writes) {
        const current = read(w.path);
        if (w.op !== 'create' && current && current.version === undefined) {
          throw new StoreError(`no version for ${w.path} in the versions list: copy it from the read's result`);
        }
      }
      return docs.batch(writes);
    },
    writes() {
      return [...written.keys()].map((p) => {
        const before = base(p);
        return { path: p, before: before && { version: before.version }, after: written.get(p) };
      });
    },
  };
}

// The database's rules over any backing that can read ({version, data} or null), list a
// collection's ids, write a {version, data} and remove a document.
export function docsOver(backing) {
  const { read } = backing;

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
      backing.remove(p.path);
      return { path: p.path, version: null };
    }
    backing.write(p.path, p.next);
    return { path: p.path, version: p.next.version };
  }

  return {
    get(docPath) {
      return read(docPath);
    },

    // Documents directly in a collection (not its subcollections), sorted by id.
    list(collection) {
      return backing.ids(collection).sort().map((id) => ({ id, ...read(`${collection}/${id}`) }));
    },

    // writes: [{op: 'create' | 'set' | 'update' | 'delete', path, data?, ifVersion?}]
    batch(writes) {
      checkBatch(writes);
      if (writes.some((w) => w.ifVersion !== undefined)) return writes.map(check).map(apply);
      return writes.map((w) => apply(check(w)));
    },
  };
}

// The limits on one batch: 1–50 writes, each document once, ≤1 MiB.
export function checkBatch(writes) {
  if (writes.length < 1 || writes.length > MAX_BATCH_WRITES) {
    throw new StoreError(`a batch holds 1–${MAX_BATCH_WRITES} writes, got ${writes.length}`);
  }
  const paths = writes.map((w) => w.path);
  const twice = paths.find((p, i) => paths.indexOf(p) !== i);
  if (twice) throw new StoreError(`${twice} appears twice in one batch`);
  const bytes = writes.reduce((n, w) => n + Buffer.byteLength(JSON.stringify(w.data ?? null)), 0);
  if (bytes > MAX_BATCH_BYTES) throw new StoreError(`batch is ${bytes} bytes, over 1 MiB`);
}
