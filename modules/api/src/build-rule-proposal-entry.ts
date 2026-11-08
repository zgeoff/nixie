import type { PendingRuleProposal } from '@heynixie/definitions';

export function buildRuleProposalEntry(entry: PendingRuleProposal) {
  return {
    proposalID: entry.proposal.proposalID,
    changes: entry.proposal.changes.map((change) => ({
      ruleID: change.ruleID,
      before:
        change.before === null
          ? null
          : { ruleHash: change.before.hash, sentence: change.before.sentence },
      after:
        change.after === null
          ? null
          : { ruleHash: change.after.hash, sentence: change.after.sentence },
    })),
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
  };
}
