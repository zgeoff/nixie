import type { Kysely } from 'kysely';
import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';
import { toSharedProposal } from './to-shared-proposal';

// The rows in any state, named by their proposal IDs or short IDs, oldest first. A proposal ID
// names its own row, and a short ID the newest row that holds it. An ID that names no row is left
// out.
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
    .orderBy('created_sequence', 'desc')
    .execute();

  const named = new Map<string, SharedProposal>();

  for (const proposalID of new Set(proposalIDs)) {
    const row =
      rows.find((candidate) => candidate.proposal_id === proposalID) ??
      rows.find((candidate) => candidate.short_id === proposalID);

    if (row !== undefined) {
      named.set(row.proposal_id, toSharedProposal(row));
    }
  }

  return [...named.values()].toSorted(
    (left, right) => left.createdSequence - right.createdSequence,
  );
}
