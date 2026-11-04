// Instruction budget: what a skill injects at load (`boot`, alone or with --tracker) stays under
// the ~30,000-character inline ceiling of `!` output; past it the model gets a file path and a
// preview, and spends a turn reading the rest. Measured on the real `boot` output, both backends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../lib/boot.mjs';

const REF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/tracker/references');
const FAMILIES = ['read', 'record', 'roster', 'undo', 'playbook', 'cycle'];
const ROUTES = ['log', 'assess', 'sensitive', 'recall', 'retract', 'roster', 'state', 'brief', 'status', 'advice', 'research', 'playbook', 'alerts'];
const CEILING = 30_000;

function dataDir(pointer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-budget-'));
  fs.writeFileSync(path.join(dir, 'cycles.json'), JSON.stringify(pointer));
  return dir;
}
const BACKENDS = {
  artifact: dataDir({ current: 'https://claude.ai/artifact/X', archived: [] }),
  local: dataDir({ backend: 'local', current: null, archived: [] }),
};

test('every store family has its commands file, and a route names only known families', () => {
  for (const f of ['core', ...FAMILIES]) assert.ok(fs.existsSync(path.join(REF, 'store', `${f}.md`)), `store/${f}.md`);
  for (const b of Object.keys(BACKENDS)) assert.ok(fs.existsSync(path.join(REF, 'store', b, 'core.md')), `store/${b}/core.md`);
  for (const route of ROUTES) {
    const m = fs.readFileSync(path.join(REF, `${route}.md`), 'utf8').split('\n')[0].match(/^\*\*Load:\*\*\s*(.*)$/);
    assert.ok(m, `${route}.md starts with a **Load:** line`);
    for (const f of m[1].split(',').map((s) => s.trim()).filter(Boolean)) assert.ok(FAMILIES.includes(f), `${route}: unknown family ${f}`);
  }
});

for (const [backend, dir] of Object.entries(BACKENDS)) {
  for (const route of [undefined, ...ROUTES, ...FAMILIES.map((f) => `store/${f}`)]) {
    for (const tracker of [false, true]) {
      const name = `boot ${route ?? ''}${tracker ? ' --tracker' : ''} on the ${backend} backend`;
      test(`${name} injects at most ${CEILING} characters`, () => {
        const n = [...boot({ dataDir: dir, route, tracker })].length;
        assert.ok(n <= CEILING, `${name}: ${n} characters`);
      });
    }
  }
}
