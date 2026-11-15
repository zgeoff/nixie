import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import { proposalsWithdrawnCodec } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';

// A Decline of a new ask in the group ends the habit that the group's open proposed rule rests on.
export async function writeGapWithdrawal(
  tx: Transaction<unknown>,
  context: ProposalContext,
  groupHash: string,
): Promise<void> {
  const group = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('gap_groups')
    .select('proposal_id')
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  if (group?.proposal_id === null || group === undefined) {
    return;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: proposalsWithdrawnCodec.kind,
      definitions: context.definitions(),
      payload: proposalsWithdrawnCodec.encode({ proposalID: group.proposal_id }),
    },
  ]);
}
