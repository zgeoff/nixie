import type { Kysely } from 'kysely';
import type { ProposalTables } from './proposal-tables';

// The proposal each record created, by the record's sequence. A sequence that created no proposal
// is left out.
export async function readProposalsBySequence(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, { readonly proposalID: string; readonly shortID: string }>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'short_id', 'created_sequence'])
    .where('created_sequence', 'in', [...sequences])
    .execute();

  return new Map(
    rows.map((row) => [
      row.created_sequence,
      { proposalID: row.proposal_id, shortID: row.short_id },
    ]),
  );
}
