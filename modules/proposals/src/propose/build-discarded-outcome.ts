import type { ApplyOutcome, DiscardOutcome, SharedProposal } from '../answer/proposal-kind-handler';

// The outcome of a family whose proposal holds nothing but its own records, so a decline, a lapse
// and a withdrawal undo nothing.
export function buildDiscardedOutcome(
  row: Pick<SharedProposal, 'id'>,
  outcome: DiscardOutcome,
): ApplyOutcome {
  return {
    status: 'done',
    result: { proposalID: row.id, state: outcome },
    usedBy: null,
    detail: null,
    otherThreads: [],
  };
}
