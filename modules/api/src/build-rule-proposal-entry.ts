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
    effectChanges: entry.proposal.effectChanges.map((change) => ({
      tool: change.tool,
      remove: change.remove,
      sentence: `${change.tool} no longer has the ${change.remove.join(', ')} effect, so rules on that effect stop covering it.`,
    })),
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
  };
}
