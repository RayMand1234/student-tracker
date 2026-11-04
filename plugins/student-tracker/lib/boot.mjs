// What a tracker turn reads before it touches the store, printed in one call so skills can
// inject it at load time (`!` in SKILL.md) instead of spending a model turn per file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreError } from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACKER = path.join(ROOT, 'skills/tracker');
const REF = path.join(TRACKER, 'references');
// The tracker's SKILL.md line that injects this output; --tracker prints the body with it replaced.
// Routes whose reply skips the alert (tracker SKILL.md, End); every other route gets alerts.md.
const NO_ALERT = ['brief', 'status', 'research', 'alerts'];
const INJECT = /^!`student-tracker-store [^`]* boot`$/m;

// CRLF (a Windows checkout) would hide the **Load:** line, the frontmatter and the inject line.
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const section = (rel, text) => `<!-- ${rel} -->\n${text}`;

function pointer(dataDir) {
  const file = path.join(dataDir, 'cycles.json');
  let text = null;
  try { text = fs.readFileSync(file, 'utf8').trim(); } catch { /* missing = none */ }
  let p = {};
  try { p = text ? JSON.parse(text) : {}; } catch { /* shown as is */ }
  const backend = (typeof p.current === 'string' && p.current.startsWith('local:')) || p.backend === 'local' ? 'local' : 'artifact';
  return { file, text, backend };
}

// A store family's commands, and its backend's file if it has one.
function family(name, backend, seen) {
  if (!/^[a-z]+$/.test(name) || !fs.existsSync(path.join(REF, `store/${name}.md`))) throw new StoreError(`unknown store family ${name}`);
  const out = [];
  // A backend file only where the family runs differently there.
  for (const rel of [`store/${name}.md`, `store/${backend}/${name}.md`]) {
    if (seen.has(rel) || !fs.existsSync(path.join(REF, rel))) continue;
    seen.add(rel);
    out.push(section(`references/${rel}`, read(path.join(REF, rel))));
  }
  return out;
}

// `store/<family>` alone prints that family (a route's "load <family>" mid-way).
function route(name, backend, seen, alerts = !NO_ALERT.includes(name)) {
  if (name.startsWith('store/')) return family(name.slice('store/'.length), backend, seen);
  const file = path.join(REF, `${name}.md`);
  if (!/^[a-z]+$/.test(name) || !fs.existsSync(file)) throw new StoreError(`unknown route ${name}`);
  const text = read(file);
  const out = [section(`references/${name}.md`, text)];
  if (alerts) out.push(...route('alerts', backend, seen, false));
  const load = text.split('\n')[0].match(/^\*\*Load:\*\*\s*(.*)$/)?.[1] ?? '';
  for (const f of load.split(',').map((s) => s.trim()).filter(Boolean)) out.push(...family(f, backend, seen));
  return out;
}

export function boot({ dataDir, route: name, tracker = false }) {
  if (!dataDir) throw new StoreError('--data is required');
  const p = pointer(dataDir);
  const seen = new Set();
  const parts = [];
  if (!name && !tracker) {
    parts.push(`Pointer \`${p.file}\`: ${p.text ?? 'missing (none)'}\nBackend: ${p.backend}`);
    for (const rel of ['store/core.md', `store/${p.backend}/core.md`]) {
      seen.add(rel);
      parts.push(section(`references/${rel}`, read(path.join(REF, rel))));
    }
  }
  if (tracker) {
    // The shortcut skills load the tracker's instructions through this, not the Skill tool.
    const core = boot({ dataDir });
    for (const rel of ['store/core.md', `store/${p.backend}/core.md`]) seen.add(rel);
    const body = read(path.join(TRACKER, 'SKILL.md')).replace(/^---\n[\s\S]*?\n---\n/, '')
      .replaceAll('${CLAUDE_PLUGIN_DATA}', dataDir).replaceAll('${CLAUDE_PLUGIN_ROOT}', ROOT)
      .replace(INJECT, () => core);
    parts.unshift(`Tracker skill directory: ${TRACKER} (links are relative to it; a route's links to references/).\n\n${body}`);
  }
  if (name) parts.push(`Route loaded: ${name}`, ...route(name, p.backend, seen));
  return `${parts.join('\n\n')}\n`;
}
