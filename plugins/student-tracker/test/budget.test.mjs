// Instruction budget: what one tracker turn reads (SKILL.md, the store cores, one route, the
// store families its **Load:** line names, and alerts.md where the reply runs it) stays small.
// Keeps the progressive-loading layout from growing back into one big read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRACKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/tracker');
const REF = path.join(TRACKER, 'references');
const words = (f) => fs.readFileSync(f, 'utf8').split(/\s+/).filter(Boolean).length;
const FAMILIES = ['read', 'record', 'roster', 'undo', 'playbook', 'cycle'];
const ROUTES = ['log', 'assess', 'sensitive', 'recall', 'retract', 'roster', 'state', 'brief', 'status', 'advice', 'research', 'playbook'];
const NO_ALERT = ['brief', 'status', 'research'];
// Measured after the split (was 11–14k words per turn); a ceiling, not a target.
const BUDGET = { local: 5000, artifact: 6000 };

function load(file) {
  const first = fs.readFileSync(file, 'utf8').split('\n')[0];
  const m = first.match(/^\*\*Load:\*\*\s*(.*)$/);
  assert.ok(m, `${path.basename(file)} starts with a **Load:** line`);
  const families = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  for (const f of families) assert.ok(FAMILIES.includes(f), `${path.basename(file)}: unknown family ${f}`);
  return families;
}

export function turnWords(route, backend) {
  const families = new Set(load(path.join(REF, `${route}.md`)));
  const files = [path.join(TRACKER, 'SKILL.md'), path.join(REF, 'store/core.md'), path.join(REF, `store/${backend}/core.md`), path.join(REF, `${route}.md`)];
  if (!NO_ALERT.includes(route)) {
    files.push(path.join(REF, 'alerts.md'));
    for (const f of load(path.join(REF, 'alerts.md'))) families.add(f);
  }
  for (const f of families) files.push(path.join(REF, `store/${f}.md`), path.join(REF, `store/${backend}/${f}.md`));
  return files.reduce((n, f) => n + words(f), 0);
}

test('every store family has a neutral file and one per backend', () => {
  for (const f of ['core', ...FAMILIES]) {
    for (const dir of ['store', 'store/artifact', 'store/local']) {
      assert.ok(fs.existsSync(path.join(REF, dir, `${f}.md`)), `${dir}/${f}.md`);
    }
  }
});

for (const route of ROUTES) {
  for (const backend of ['local', 'artifact']) {
    test(`a ${route} turn on the ${backend} backend reads at most ${BUDGET[backend]} words`, () => {
      const n = turnWords(route, backend);
      assert.ok(n <= BUDGET[backend], `${route}/${backend}: ${n} words`);
    });
  }
}
