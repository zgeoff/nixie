import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';
import { toSharedProposal } from './to-shared-proposal';

// The rows in any state, named by their proposal IDs or short IDs, oldest first. An ID that names
// no row is left out.
export async function readProposalsByID(
  db: Kysely<unknown>,
  proposalIDs: readonly string[],
): Promise<readonly SharedProposal[]> {
  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .selectAll()
    .where((eb) =>
      eb.or([eb('proposal_id', 'in', [...proposalIDs]), eb('short_id', 'in', [...proposalIDs])]),
    )
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => toSharedProposal(row));
}
