// Plain-text payloads for the store CLI. Not JSON on purpose: Claude Code's Bash safety check
// refuses commands containing `{"`, which a JSON heredoc always does.
import { StoreError } from './store.mjs';

// How a "+key: value" line's value is read; any other key is passed on as text.
const LIST_FIELDS = new Set(['topics', 'closes', 'evidence']);
const NUMBER_FIELDS = new Set(['score']);
const FLAG_FIELDS = new Set(['unlisted']);

// target: / yellow: / red: lines (days) into `out.talk`.
const talkFields = (out) => Object.fromEntries(['target', 'yellow', 'red'].map((k) => [k, (v) => ((out.talk ??= {})[k] = Number(v))]));

// commander: <name> / role: <role> / cycle: <name> / start: YYYY-MM-DD / target: / yellow: / red: (days)
// / trainee: <name> (repeat)
export function parseCycle(input) {
  const out = { commander: {}, cycle: {}, trainees: [] };
  const set = {
    commander: (v) => (out.commander.name = v),
    role: (v) => (out.commander.role = v),
    cycle: (v) => (out.cycle.name = v),
    start: (v) => (out.cycle.start = v),
    ...talkFields(out.commander),
    trainee: (v) => out.trainees.push(v),
    previous: (v) => (out.previous = v),
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
// --- sensitive <category>       (zero or more, cut out of the Evidence above)
// +kind: <kind> / +closes: <ids> (optional)
// <the sensitive sentence, word-for-word>
// --- followup                   (zero or more, opened by the sensitive part above)
// --- assessment <tid> <skill id> <score> <author>   (zero or more)
// +evidence: <#n or Evidence id>, …
// <reason>
// --- item <tid> <improve|keep> <agent|commander>    (zero or more improve/keep items)
// +from: <#n or Evidence id>
// <text>
// --- status <tid> <good|watch|concern>  + "+evidence:" + reason   (Trainee-state changes, zero or more)
// --- stage <tid>  + "+to: <stage | none>" + "+evidence:" + optional reason
// --- snapshot <tid>  + text
// --- retire <tid> <item id> <agent|commander>  + "+evidence:" + reason
// --- next-talk <tid>  + one next-Talk question per line (two or three)
export function parseEntry(input) {
  const lines = input.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0]?.trim() !== '--- entry') throw new StoreError('payload must start with a "--- entry" line');

  const text = [];
  const evidence = [];
  const assessments = [];
  const state = []; // items and Trainee-state changes, in the order given
  let body = text;
  let target = null; // what "+key: value" and "--- followup" lines attach to: an Evidence or a sensitive part
  let fieldsOpen = false; // "+key: value" lines are read only right after an Evidence or sensitive header
  for (const line of lines.slice(1)) {
    if (line.startsWith('--- evidence ')) {
      const [trainee, kind, date, ...extra] = line.slice('--- evidence '.length).trim().split(/\s+/);
      if (extra.length) throw new StoreError(`kind fields go on "+key: value" lines, not the header: "${line}"`);
      body = [];
      fieldsOpen = true;
      target = { fields: { trainee, kind, date }, body, followups: [], sensitive: [] };
      evidence.push(target);
    } else if (line.startsWith('--- sensitive')) {
      if (assessments.includes(target) || state.includes(target)) {
        throw new StoreError('a "--- sensitive" block goes right after its Evidence, before the assessments, items and changes');
      }
      const owner = evidence.at(-1);
      if (!owner) throw new StoreError('a "--- sensitive" block must follow the Evidence it is cut out of');
      const [category, ...extra] = line.slice('--- sensitive'.length).trim().split(/\s+/);
      if (extra.length) throw new StoreError(`a "--- sensitive <category>" header takes only the category: "${line}"`);
      body = [];
      fieldsOpen = true;
      target = { fields: { category }, body, followups: [] };
      owner.sensitive.push(target);
    } else if (line.startsWith('--- assessment ')) {
      body = [];
      fieldsOpen = true;
      target = assessmentBlock(line, body);
      assessments.push(target);
    } else if (STATE_HEADER.test(line)) {
      body = [];
      fieldsOpen = true;
      target = stateBlock(line, body);
      state.push(target);
    } else if (line.trim() === '--- followup') {
      if (!target?.followups) throw new StoreError('a "--- followup" block must follow the Evidence that opens it');
      body = [];
      fieldsOpen = false;
      target.followups.push(body);
    } else if (fieldsOpen && /^\+\w+:/.test(line)) {
      const [, key, value] = line.match(/^\+(\w+):\s*(.*)$/);
      target.fields[key] = fieldValue(key, value.trim());
    } else {
      fieldsOpen = false;
      body.push(line);
    }
  }

  const withFollowups = ({ fields, body: excerpt, followups }) => ({
    ...fields,
    excerpt: excerpt.join('\n'),
    ...(followups.length ? { followups: followups.map((f) => f.join('\n')) } : {}),
  });
  return {
    text: text.join('\n'),
    evidence: evidence.map((ev) => ({
      ...withFollowups(ev),
      ...(ev.sensitive.length ? { sensitive: ev.sensitive.map(withFollowups) } : {}),
    })),
    assessments: assessments.map(assessmentOf),
    items: state.filter((b) => b.list === 'items').map(stateOf),
    changes: state.filter((b) => b.list === 'changes').map(stateOf),
  };
}

const STATE_HEADER = /^--- (item|status|stage|snapshot|retire|next-talk)( |$)/;
// What each state block header holds after its name, and where its body goes.
const STATE_BLOCKS = {
  item: { list: 'items', head: ['trainee', 'kind', 'by'], body: 'text' },
  status: { list: 'changes', type: 'status', head: ['trainee', 'to'], body: 'reason' },
  stage: { list: 'changes', type: 'stage', head: ['trainee'], body: 'reason' },
  snapshot: { list: 'changes', type: 'snapshot', head: ['trainee'], body: 'text' },
  retire: { list: 'changes', type: 'retired', head: ['trainee', 'item', 'by'], body: 'reason' },
  'next-talk': { list: 'changes', type: 'nextTalk', head: ['trainee'], body: 'questions' },
};

function stateBlock(line, body) {
  const [, name] = line.match(STATE_HEADER);
  const spec = STATE_BLOCKS[name];
  const words = line.slice(`--- ${name}`.length).trim().split(/\s+/).filter(Boolean);
  if (words.length !== spec.head.length) throw new StoreError(`a ${name} header is "--- ${name} <${spec.head.join('> <')}>": "${line}"`);
  const fields = Object.fromEntries(spec.head.map((k, i) => [k, words[i]]));
  return { list: spec.list, spec, fields: spec.type ? { ...fields, type: spec.type } : fields, body };
}

// A stage `+to: none` leaves the evaluation process; its reason is optional (none when blank).
function stateOf({ spec, fields, body }) {
  if (spec.body === 'questions') return { ...fields, questions: body.map((l) => l.trim()).filter(Boolean) };
  const out = { ...fields, [spec.body]: body.join('\n').trim() };
  if (spec.type === 'stage') {
    if (out.to === 'none') out.to = null;
    out.reason ||= null;
  }
  return out;
}

// The same "--- assessment" blocks, on their own, for one Trainee: `record-assessments`.
export function parseAssessments(input) {
  const blocks = [];
  let body = null;
  let fieldsOpen = false;
  let nextTalk = null;
  for (const line of input.split('\n')) {
    if (line.startsWith('--- assessment ')) {
      body = [];
      fieldsOpen = true;
      blocks.push(assessmentBlock(line, body));
    } else if (line.startsWith('--- next-talk')) {
      if (nextTalk) throw new StoreError('one "--- next-talk" block at most');
      body = [];
      fieldsOpen = false;
      nextTalk = stateBlock(line, body);
    } else if (!body) {
      if (line.trim()) throw new StoreError('payload must start with a "--- assessment" line');
    } else if (fieldsOpen && /^\+\w+:/.test(line)) {
      const [, key, value] = line.match(/^\+(\w+):\s*(.*)$/);
      blocks.at(-1).fields[key] = fieldValue(key, value.trim());
    } else {
      fieldsOpen = false;
      body.push(line);
    }
  }
  const assessments = blocks.map(assessmentOf);
  const questions = nextTalk && stateOf(nextTalk);
  const tids = [...new Set([...assessments, ...(questions ? [questions] : [])].map((a) => a.trainee))];
  if (tids.length !== 1) throw new StoreError('record-assessments takes the Assessments (and next-Talk questions) of one Trainee');
  return {
    trainee: tids[0],
    assessments: assessments.map(({ trainee, ...a }) => a),
    ...(questions ? { nextTalk: questions.questions } : {}),
  };
}

function assessmentBlock(line, body) {
  const [trainee, skill, score, author, ...extra] = line.slice('--- assessment '.length).trim().split(/\s+/);
  if (!author || extra.length) throw new StoreError(`an assessment header is "--- assessment <tid> <skill id> <score> <author>": "${line}"`);
  return { fields: { trainee, skill, score: Number(score), author }, body };
}

const assessmentOf = ({ fields, body }) => ({ ...fields, reason: body.join('\n').trim() });

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

// "key: value" lines (a bare "key" line has value ''), blank lines skipped.
function keyLines(input) {
  return input.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([\w-]+)(?::\s*(.*))?$/);
    if (!m) throw new StoreError(`unexpected line "${line}"; lines are "key: value"`);
    return [m[1], (m[2] ?? '').trim(), line];
  });
}

// One change per payload: the first line names it and holds its main value; the lines after it
// fill its fields. `changes` = {header key: {build(value) → change, fields: {key: (change, value) → void}}}.
function parseOne(input, changes) {
  const [first, ...rest] = keyLines(input);
  if (!first || !changes[first[0]]) throw new StoreError(`the first line names the change: one of ${Object.keys(changes).join(', ')}`);
  const spec = changes[first[0]];
  const out = spec.build(first[1]);
  for (const [key, value, line] of rest) {
    if (changes[key] && !spec.fields[key]) throw new StoreError(`one change per call: "${line}" starts another`);
    if (!spec.fields[key]) throw new StoreError(`unexpected line "${line}" (keys: ${Object.keys(spec.fields).join(', ') || 'none'})`);
    spec.fields[key](out, value);
  }
  return out;
}

const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);

// add: <name> | rename: <name> | leave: YYYY-MM-DD + how: + reason: | rejoin
// | status: <good|watch|concern> + reason: + evidence: <ids> (optional)
export function parseTraineeChange(input) {
  return parseOne(input, {
    add: { build: (name) => ({ add: { name } }), fields: {} },
    rename: { build: (name) => ({ rename: { name } }), fields: {} },
    leave: {
      build: (date) => ({ leave: { date } }),
      fields: { how: (c, v) => (c.leave.how = v), reason: (c, v) => (c.leave.reason = v) },
    },
    rejoin: { build: () => ({ rejoin: {} }), fields: {} },
    status: {
      build: (to) => ({ status: { to, evidence: [] } }),
      fields: { reason: (c, v) => (c.status.reason = v), evidence: (c, v) => c.status.evidence.push(...list(v)) },
    },
  });
}

// name: / role: (empty clears it) / target: / yellow: / red: (days)
export function parseSettings(input) {
  const out = {};
  const set = {
    name: (v) => (out.name = v),
    role: (v) => (out.role = v || null),
    ...talkFields(out),
  };
  for (const [key, value, line] of keyLines(input)) {
    if (!set[key]) throw new StoreError(`unexpected line "${line}" (keys: ${Object.keys(set).join(', ')})`);
    set[key](value);
  }
  return out;
}

// One Cycle change, named by its first line (see storage-local.md).
export function parseCycleChange(input) {
  const aliases = (key) => (c, v) => (c[key].aliases ??= []).push(v);
  return parseOne(input, {
    'add-test': {
      build: (name) => ({ addTest: { name, aliases: [] } }),
      fields: { subject: (c, v) => (c.addTest.subject = v), number: (c, v) => (c.addTest.number = v), alias: aliases('addTest') },
    },
    'edit-test': {
      build: (test) => ({ editTest: { test } }),
      fields: { name: (c, v) => (c.editTest.name = v), number: (c, v) => (c.editTest.number = v), alias: aliases('editTest') },
    },
    'remove-test': { build: (test) => ({ removeTest: { test } }), fields: {} },
    'remove-project': { build: (project) => ({ removeProject: { project } }), fields: {} },
    'remove-week': { build: (week) => ({ removeWeek: { week: Number(week) } }), fields: {} },
    'add-project': {
      build: (name) => ({ addProject: { name, aliases: [] } }),
      fields: { subject: (c, v) => (c.addProject.subject = v), alias: aliases('addProject') },
    },
    week: {
      build: (week) => ({ setWeek: { week: Number(week), subjects: [] } }),
      fields: { subjects: (c, v) => (c.setWeek.subjects = list(v)), projects: (c, v) => (c.setWeek.projects = list(v)) },
    },
    'add-skill': { build: (name) => ({ addSkill: { name } }), fields: { group: (c, v) => (c.addSkill.group = v) } },
    'archive-skill': { build: (skill) => ({ archiveSkill: { skill } }), fields: {} },
    'restore-skill': { build: (skill) => ({ restoreSkill: { skill } }), fields: {} },
    team: {
      build: (name) => ({ setTeam: { name, members: [] } }),
      fields: {
        id: (c, v) => (c.setTeam.id = v),
        project: (c, v) => (c.setTeam.project = v),
        member: (c, v) => c.setTeam.members.push(v),
      },
    },
  });
}

// One of the Commander's Playbook items (new, or the fields an edit changes):
// +kind: sign | tip | exercise | talk-question
// +skills: <Skill id>, … | general
// +band: low | mid | high | none
// +source: <Entry id>            (an item taken from an Entry)
// <the text, word-for-word, any number of lines; none on an edit that keeps it>
export function parsePlaybookItem(input) {
  const out = {};
  const set = {
    kind: (v) => (out.kind = v),
    skills: (v) => (out.skills = list(v)),
    band: (v) => (out.band = v === 'none' ? null : v),
    source: (v) => (out.source = v),
  };
  const lines = input.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!line.startsWith('+')) break;
    const m = line.match(/^\+([\w-]+):\s*(.*)$/);
    if (!m || !set[m[1]]) throw new StoreError(`unexpected line "${line}" (keys: ${Object.keys(set).map((k) => `+${k}:`).join(', ')})`);
    set[m[1]](m[2].trim());
  }
  const text = lines.slice(i).join('\n').trim();
  if (text) out.text = text;
  return out;
}
