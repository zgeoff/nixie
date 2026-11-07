import { store } from './store';

export function readMockRuleProposals() {
  const pending = store.ruleProposals.findMany(
    (query) =>
      query.where(
        (proposal) => proposal.status === 'pending' && proposal.lapseAt.getTime() > Date.now(),
      ),
    { orderBy: { createdAt: 'asc' } },
  );

  return pending.map((proposal) => ({
    proposalID: proposal.proposalID,
    changes: proposal.changes.map((change) => ({
      ruleID: change.ruleID,
      before: change.before === null ? null : { ...change.before },
      after: change.after === null ? null : { ...change.after },
    })),
    createdAt: proposal.createdAt,
    lapseAt: proposal.lapseAt,
  }));
}
