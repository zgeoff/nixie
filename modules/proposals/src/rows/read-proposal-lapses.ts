import type { Kysely } from 'kysely';
import type { ProposalTables } from './proposal-tables';

export async function readProposalLapses(
  db: Kysely<unknown>,
  proposalIDs: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (proposalIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'lapses_at'])
    .where('proposal_id', 'in', proposalIDs)
    .execute();

  return new Map(rows.map((row) => [row.proposal_id, row.lapses_at]));
}
