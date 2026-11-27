import type { PendingRuleProposal } from '@heynixie/definitions';
import type { Rule } from '@heynixie/policy';
import { describeCondition } from '@heynixie/policy';
import { toConditionField } from './to-condition-field';

// The condition of a rule version reads as yours: a proposal reaches you through the seed or your
// own edit, and a mandate never goes through one.
export function buildRuleProposalEntry(
  entry: PendingRuleProposal,
  rules: ReadonlyMap<string, Rule>,
) {
  const buildVersion = (side: { readonly hash: string; readonly sentence: string } | null) => {
    if (side === null) {
      return null;
    }

    const rule = rules.get(side.hash);

    return {
      ruleHash: side.hash,
      sentence: side.sentence,
      ...(rule === undefined ? {} : toConditionField(describeCondition(rule, 'you'))),
    };
  };

  return {
    proposalID: entry.proposal.proposalID,
    changes: entry.proposal.changes.map((change) => ({
      ruleID: change.ruleID,
      before: buildVersion(change.before),
      after: buildVersion(change.after),
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
