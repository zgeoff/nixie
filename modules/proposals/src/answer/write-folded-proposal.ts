import type { LogTables, Projection } from '@heynixie/log';
import { buildEnvelopeRecord } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { ProposalTables } from '../rows/proposal-tables';

// A log that holds no proposals projection keeps no row, so the row folds again from the records
// that name the proposal, as the projection folds each one.
export async function writeFoldedProposal(
  tx: Transaction<unknown>,
  projection: Projection,
  proposalID: string,
): Promise<void> {
  const records = tx.$extendTables<LogTables>();
  const idColumn = sql`json_extract(payload, '$.proposalID')`;
  const shortIDColumn = sql`json_extract(payload, '$.shortID')`;

  const named = await records
    .selectFrom('records')
    .select(idColumn.as('proposal_id'))
    .where((eb) => eb.or([eb(idColumn, '=', proposalID), eb(shortIDColumn, '=', proposalID)]))
    .limit(1)
    .executeTakeFirst();

  if (typeof named?.proposal_id !== 'string') {
    return;
  }

  const rows = await records
    .selectFrom('records')
    .selectAll()
    .where(idColumn, '=', named.proposal_id)
    .orderBy('sequence')
    .execute();

  await tx
    .$extendTables<ProposalTables>()
    .deleteFrom('proposals')
    .where('proposal_id', '=', named.proposal_id)
    .execute();

  for (const row of rows) {
    await projection.fold(tx, buildEnvelopeRecord(row));
  }
}
