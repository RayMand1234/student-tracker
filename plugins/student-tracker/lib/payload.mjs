// Plain-text payloads for the store CLI. Not JSON on purpose: Claude Code's Bash safety check
// refuses commands containing `{"`, which a JSON heredoc always does.
import { StoreError } from './store.mjs';

const LIST_FIELDS = new Set(['topics']);

// commander: <name> / role: <role> / cycle: <name> / start: YYYY-MM-DD / trainee: <name> (repeat)
export function parseCycle(input) {
  const out = { commander: {}, cycle: {}, trainees: [] };
  const set = {
    commander: (v) => (out.commander.name = v),
    role: (v) => (out.commander.role = v),
    cycle: (v) => (out.cycle.name = v),
    start: (v) => (out.cycle.start = v),
    trainee: (v) => out.trainees.push(v),
  };
  for (const line of input.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m || !set[m[1]]) throw new StoreError(`unexpected line "${line}" (keys: ${Object.keys(set).join(', ')})`);
    set[m[1]](m[2].trim());
  }
  return out;
}

// --- entry
// <the Commander's message, word-for-word, any number of lines>
// --- evidence <tid> <kind> <YYYY-MM-DD> [topics=a,b]
// <excerpt, word-for-word>
export function parseEntry(input) {
  const lines = input.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0]?.trim() !== '--- entry') throw new StoreError('payload must start with a "--- entry" line');

  const blocks = [];
  let current = { header: null, body: [] };
  for (const line of lines.slice(1)) {
    if (line.startsWith('--- evidence ')) {
      blocks.push(current);
      current = { header: line.slice('--- evidence '.length).trim().split(/\s+/), body: [] };
    } else {
      current.body.push(line);
    }
  }
  blocks.push(current);

  const [entry, ...evidence] = blocks;
  return {
    text: entry.body.join('\n'),
    evidence: evidence.map(({ header: [trainee, kind, date, ...extra], body }) => {
      const ev = { trainee, kind, date, excerpt: body.join('\n') };
      for (const kv of extra) {
        const [key, value = ''] = kv.split('=');
        if (!LIST_FIELDS.has(key)) throw new StoreError(`unknown Evidence field "${key}"`);
        ev[key] = value.split(',').filter(Boolean);
      }
      return ev;
    }),
  };
}
