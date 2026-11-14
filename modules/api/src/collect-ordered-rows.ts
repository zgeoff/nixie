import type { SharedProposal } from '@heynixie/proposals';

export type ApprovalGroup = 'always_ask' | 'routine' | 'memory' | 'deferred';

const groupOrder: readonly ApprovalGroup[] = ['always_ask', 'routine', 'memory', 'deferred'];

export function pickApprovalGroup(row: SharedProposal): ApprovalGroup {
  if (row.state === 'deferred') {
    return 'deferred';
  }

  if (row.riskClass === 'always_ask' || row.riskClass === 'lifting') {
    return 'always_ask';
  }

  return row.kind === 'memory_write' ? 'memory' : 'routine';
}

// The digest's order: always-ask rows with the lifting ones first, then routine rows by task, then
// memory, then deferred. Each list runs oldest first.
export function collectOrderedRows<Row extends { readonly proposal: SharedProposal }>(
  rows: readonly (Row & { readonly group: ApprovalGroup; readonly taskName: string | null })[],
): readonly Row[] {
  return rows.toSorted((left, right) => {
    const byGroup = groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group);

    if (byGroup !== 0) {
      return byGroup;
    }

    if (left.group === 'always_ask') {
      const byLifting = liftingRank(left.proposal) - liftingRank(right.proposal);

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

    return left.proposal.createdSequence - right.proposal.createdSequence;
  });
}

function liftingRank(row: SharedProposal): number {
  return row.riskClass === 'lifting' ? 0 : 1;
}
