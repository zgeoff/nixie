import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from '../rows/proposal-tables';
import { toSharedProposal } from '../rows/to-shared-proposal';

export async function readReturningProposals(
  db: Kysely<unknown>,
  now: number,
): Promise<readonly SharedProposal[]> {
  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .selectAll()
    .where('state', '=', 'deferred')
    .where('return_at', '<=', now)
    .orderBy('return_at')
    .execute();

  return rows.map((row) => toSharedProposal(row));
}
