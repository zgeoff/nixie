import { pickMockPasskeyChoices } from './pick-mock-passkey-choices';
import { store } from './store';
import { toMockApprovalBody, toMockApprovalProposal } from './to-mock-approval-proposal';

// The open rows that have a body, in the digest's order: always-ask rows with the lifting ones
// first, then routine rows by task, then memory, then deferred. Each list runs oldest first.
export function readMockApprovalItems() {
  const open = store.approvalRows.findMany((query) =>
    query.where(
      (row) =>
        (row.state === 'pending' || row.state === 'deferred') &&
        row.lapsesAt.getTime() > Date.now() &&
        !row.isBodyGone,
    ),
  );

  const entries = open.map((row) => ({
    group: pickMockApprovalGroup(row),
    row,
    taskName: readMockTaskName(row),
  }));

  return entries
    .toSorted((left, right) => compareEntries(left, right))
    .map((entry) => ({
      body: toMockApprovalBody(entry.row),
      choices: [...entry.row.choices],
      group: entry.group,
      passkeyChoices: [...pickMockPasskeyChoices(entry.row)],
      proposal: toMockApprovalProposal(entry.row),
      task: toMockTask(entry.row, entry.taskName),
    }));
}

type StoredRow = ReturnType<typeof store.approvalRows.all>[number];

type ApprovalGroup = 'always_ask' | 'routine' | 'memory' | 'deferred';

function pickMockApprovalGroup(row: StoredRow): ApprovalGroup {
  if (row.state === 'deferred') {
    return 'deferred';
  }

  if (row.riskClass !== 'routine') {
    return 'always_ask';
  }

  return row.kind === 'memory_write' ? 'memory' : 'routine';
}

export function readMockTaskName(row: StoredRow): string | null {
  const taskID = row.taskID ?? row.thread;

  if (taskID === null) {
    return null;
  }

  return store.tasks.findFirst((query) => query.where({ taskID }))?.name ?? taskID;
}

export function toMockTask(row: StoredRow, name: string | null) {
  const id = row.taskID ?? row.thread;

  return id === null ? null : { id, name: name ?? id };
}

interface Entry {
  readonly group: ApprovalGroup;
  readonly row: StoredRow;
  readonly taskName: string | null;
}

const groupOrder: readonly ApprovalGroup[] = ['always_ask', 'routine', 'memory', 'deferred'];

function compareEntries(left: Entry, right: Entry): number {
  const byGroup = groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group);

  if (byGroup !== 0) {
    return byGroup;
  }

  if (left.group === 'always_ask') {
    const byLifting = liftingRank(left.row) - liftingRank(right.row);

    if (byLifting !== 0) {
      return byLifting;
    }
  }

  if (left.group === 'routine') {
    const byTask = (left.taskName ?? '').localeCompare(right.taskName ?? '');

    if (byTask !== 0) {
      return byTask;
    }
  }

  return left.row.sequence - right.row.sequence;
}

function liftingRank(row: StoredRow): number {
  return row.riskClass === 'lifting' ? 0 : 1;
}
