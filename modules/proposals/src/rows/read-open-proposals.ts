import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';
import { toSharedProposal } from './to-shared-proposal';

export async function readOpenProposals(
  db: Kysely<unknown>,
  now: number,
): Promise<readonly SharedProposal[]> {
  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .selectAll()
    .where('state', 'in', ['pending', 'deferred'])
    .where('lapses_at', '>', now)
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => toSharedProposal(row));
}
