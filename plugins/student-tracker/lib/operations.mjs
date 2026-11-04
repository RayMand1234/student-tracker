// The store operations by their CLI names, each from its arguments and text payload. Shared by
// the local commands and the plan step, so both backends run the same call with the same parsing.
import { parseCycle, parseEntry, parseAssessments, parseCycleChange, parseTraineeChange, parseSettings, parsePlaybookItem, parseNextTalk, parseSnapshot } from './payload.mjs';

const OPERATIONS = {
  connect: (store) => store.connect(),
  start: (store) => {
    const connect = store.connect();
    if (connect.setup !== 'done') return { connect };
    const resumed = connect.archived ? {} : { resumePending: store.resumePending() };
    return { connect, ...resumed, cycle: store.readCycle(), team: store.readTeam() };
  },
  'create-cycle': (store, { input }) => store.createCycle(parseCycle(input())),
  'finish-setup': (store) => store.finishSetup(),
  'read-cycle': (store) => store.readCycle(),
  'read-team': (store) => store.readTeam(),
  'read-trainee': (store, { args, since, retracted }) => store.readTrainee(args[0], { since, retracted }),
  'record-entry': (store, { input, insist }) => store.recordEntry({ ...parseEntry(input()), insist }),
  'read-playbook': (store, { args }) => store.readPlaybook(args[0], { skills: args.slice(1) }),
  'read-status': (store) => store.readStatus(),
  'take-alert': (store, { args }) => store.takeAlert(args.length ? { pattern: { trainee: args[0], theme: args.slice(1).join(' ') } } : {}),
  'record-next-talk': (store, { input }) => {
    const { trainee, questions } = parseNextTalk(input());
    return store.recordNextTalk(trainee, questions);
  },
  'record-snapshot': (store, { input }) => {
    const { trainee, text } = parseSnapshot(input());
    return store.recordSnapshot(trainee, text);
  },
  'record-assessments': (store, { input, insist }) => {
    const { trainee, assessments, nextTalk } = parseAssessments(input());
    return store.recordAssessments(trainee, assessments, { insist, nextTalk });
  },
  'update-trainee': (store, { args, input }) => store.updateTrainee(args[0] ?? null, parseTraineeChange(input())),
  'update-settings': (store, { input }) => store.updateSettings(parseSettings(input())),
  'update-cycle': (store, { input }) => store.updateCycle(parseCycleChange(input())),
  'save-playbook-item': (store, { args, input }) => store.savePlaybookItem({ ...(args[0] ? { id: args[0] } : {}), ...parsePlaybookItem(input()) }),
  'retire-playbook-item': (store, { args }) => store.retirePlaybookItem(args[0]),
  'hide-playbook-item': (store, { args }) => store.hidePlaybookItem(args[0], true),
  'unhide-playbook-item': (store, { args }) => store.hidePlaybookItem(args[0], false),
  'flip-sensitive': (store, { args, category }) => store.flipSensitive(args[0], { category }),
  'retract-entry': (store, { args }) => store.retractEntry(args[0]),
  'hard-delete': (store, { args }) => store.hardDelete(args[0]),
  'resume-pending': (store) => store.resumePending(),
  'copy-commander-scope': (store, { args }) => store.copyCommanderScope(args[0]),
  'archive-cycle': (store, { args }) => store.archiveCycle(args[0]),
  'rebuild-card': (store, { args }) => store.rebuildCard(args[0]),
};

export const isOperation = (op) => Object.hasOwn(OPERATIONS, op);

// `input`: the text payload, or a function giving it (read only by operations that take one).
export function runOperation(store, op, { args = [], input = '', since, retracted = false, insist = false, category } = {}) {
  const payload = typeof input === 'function' ? input : () => input;
  return OPERATIONS[op](store, { args, input: payload, since, retracted, insist, category });
}
