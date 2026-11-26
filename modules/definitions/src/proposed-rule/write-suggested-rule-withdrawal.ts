import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { withdrawRuleProposal } from './withdraw-rule-proposal';

// A Decline of a new ask in the group ends the habit that the group's open proposed rule rests on.
export async function writeSuggestedRuleWithdrawal(
  tx: Transaction<unknown>,
  context: ProposalContext,
  groupHash: string,
): Promise<void> {
  const group = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('suggested_rule_groups')
    .select('proposal_id')
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  if (group?.proposal_id === null || group === undefined) {
    return;
  }

  await withdrawRuleProposal(tx, context, group.proposal_id);
}
