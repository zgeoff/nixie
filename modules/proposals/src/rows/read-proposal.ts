import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';
import { toSharedProposal } from './to-shared-proposal';

// A proposal ID names its own row. A short ID names the newest row that holds it, so an older row
// that shares it stays answerable only by its proposal ID.
export async function readProposal(
  db: Kysely<unknown>,
  proposalID: string,
): Promise<SharedProposal | null> {
  const table = db.$extendTables<ProposalTables>();

  const exact = await table
    .selectFrom('proposals')
    .selectAll()
    .where('proposal_id', '=', proposalID)
    .executeTakeFirst();

  if (exact !== undefined) {
    return toSharedProposal(exact);
  }

  const newest = await table
    .selectFrom('proposals')
    .selectAll()
    .where('short_id', '=', proposalID)
    .orderBy('created_sequence', 'desc')
    .executeTakeFirst();

  return newest === undefined ? null : toSharedProposal(newest);
}
