import type { Kysely } from 'kysely';
import type { ProposalTables, SharedProposalState } from './proposal-tables';

// The state of each named proposal's shared row, which every outcome of every family writes.
export async function readProposalStates(
  db: Kysely<unknown>,
  proposalIDs: readonly string[],
): Promise<ReadonlyMap<string, SharedProposalState>> {
  if (proposalIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'state'])
    .where('proposal_id', 'in', proposalIDs)
    .execute();

  return new Map(rows.map((row) => [row.proposal_id, row.state]));
}
