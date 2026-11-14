import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';
import { toSharedProposal } from './to-shared-proposal';

export async function readProposal(
  db: Kysely<unknown>,
  proposalID: string,
): Promise<SharedProposal | null> {
  const row = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .selectAll()
    .where((eb) => eb.or([eb('proposal_id', '=', proposalID), eb('short_id', '=', proposalID)]))
    .executeTakeFirst();

  return row === undefined ? null : toSharedProposal(row);
}
