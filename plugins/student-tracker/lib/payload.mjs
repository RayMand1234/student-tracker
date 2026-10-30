// Plain-text payloads for the store CLI. Not JSON on purpose: Claude Code's Bash safety check
// refuses commands containing `{"`, which a JSON heredoc always does.
import { StoreError } from './store.mjs';

// How a "+key: value" line's value is read; any other key is passed on as text.
const LIST_FIELDS = new Set(['topics', 'closes']);
const NUMBER_FIELDS = new Set(['score']);
const FLAG_FIELDS = new Set(['unlisted']);

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
// --- evidence <tid> <kind> <YYYY-MM-DD>
// +<field>: <value>              (zero or more kind fields: topics, test, score, closes, …)
// <excerpt, word-for-word>
// --- followup                   (zero or more, opened by the Evidence above)
// <Follow-up text, word-for-word>
export function parseEntry(input) {
  const lines = input.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0]?.trim() !== '--- entry') throw new StoreError('payload must start with a "--- entry" line');

  const text = [];
  const evidence = [];
  let body = text;
  let fieldsOpen = false; // "+key: value" lines are read only right after an Evidence header
  for (const line of lines.slice(1)) {
    if (line.startsWith('--- evidence ')) {
      const [trainee, kind, date, ...extra] = line.slice('--- evidence '.length).trim().split(/\s+/);
      if (extra.length) throw new StoreError(`kind fields go on "+key: value" lines, not the header: "${line}"`);
      body = [];
      fieldsOpen = true;
      evidence.push({ ev: { trainee, kind, date }, body, followups: [] });
    } else if (line.trim() === '--- followup') {
      const last = evidence.at(-1);
      if (!last) throw new StoreError('a "--- followup" block must follow the Evidence that opens it');
      body = [];
      fieldsOpen = false;
      last.followups.push(body);
    } else if (fieldsOpen && /^\+\w+:/.test(line)) {
      const [, key, value] = line.match(/^\+(\w+):\s*(.*)$/);
      evidence.at(-1).ev[key] = fieldValue(key, value.trim());
    } else {
      fieldsOpen = false;
      body.push(line);
    }
  }

  return {
    text: text.join('\n'),
    evidence: evidence.map(({ ev, body: excerpt, followups }) => ({
      ...ev,
      excerpt: excerpt.join('\n'),
      ...(followups.length ? { followups: followups.map((f) => f.join('\n')) } : {}),
    })),
  };
}

function fieldValue(key, value) {
  if (LIST_FIELDS.has(key)) return value.split(',').map((v) => v.trim()).filter(Boolean);
  if (NUMBER_FIELDS.has(key)) {
    if (!value || Number.isNaN(Number(value))) throw new StoreError(`${key} must be a number, got "${value}"; leave the line out when not given`);
    return Number(value);
  }
  if (FLAG_FIELDS.has(key)) {
    if (value !== 'true' && value !== 'false') throw new StoreError(`${key} is true or false, got "${value}"`);
    return value === 'true';
  }
  return value;
}

// add-test: <name> / subject: <id> / number: <n> / alias: <alias> (repeat)
export function parseCycleChange(input) {
  const test = { aliases: [] };
  const set = {
    'add-test': (v) => (test.name = v),
    subject: (v) => (test.subject = v),
    number: (v) => (test.number = v),
    alias: (v) => test.aliases.push(v),
  };
  for (const line of input.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^([\w-]+):\s*(.+)$/);
    if (!m || !set[m[1]]) throw new StoreError(`unexpected line "${line}" (keys: ${Object.keys(set).join(', ')})`);
    set[m[1]](m[2].trim());
  }
  if (!test.name) throw new StoreError('payload needs an "add-test:" line');
  return { addTest: test };
}
