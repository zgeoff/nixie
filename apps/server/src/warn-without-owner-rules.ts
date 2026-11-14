import { readPendingRuleProposals, readRulesInForce } from '@heynixie/definitions';
import type { ServerParts } from './types';

// With no rule of yours in force, every call that consent does not allow asks, so the start says so
// and names the first seed's proposal when it still waits for your approval.
export async function warnWithoutOwnerRules(
  parts: Pick<ServerParts, 'context' | 'log'>,
): Promise<void> {
  const db = parts.context.log.writer.db;

  const rules = await readRulesInForce(db);

  if (rules.length > 0) {
    return;
  }

  const pending = await readPendingRuleProposals(db, parts.context.clock.now());

  const proposalID = pending[0]?.proposal.proposalID ?? null;

  parts.log(
    'policy.no_rules_in_force',
    {
      proposalID,
      action:
        proposalID === null
          ? 'Add rules to the definitions repository, so calls stop asking'
          : `Approve the proposal with nixie proposals approve ${proposalID}`,
    },
    'warn',
  );
}
