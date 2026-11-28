import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { proposalsSettledCodec } from '../records/proposals-settled-codec';
import type { ProposalTables } from './proposal-tables';

export interface DeclinedProposalQuery {
  readonly taskID: string;
  readonly actionHash: string;

  // only a proposal whose decline was recorded after this sequence counts
  readonly afterSequence: number;
}

// The short ID of the newest action proposal for the hash that the owner declined after the
// sequence, among those that the task asked for or that sit on its thread. Null when none. The
// proposal may have been asked in an earlier run, because the decline is what the sequence dates.
export async function readDeclinedProposalSince(
  db: Kysely<unknown>,
  query: DeclinedProposalQuery,
): Promise<string | null> {
  const row = await db
    .$extendTables<ProposalTables & LogTables>()
    .selectFrom('proposals')
    .select('short_id')
    .where('family', '=', 'action')
    .where('action_hash', '=', query.actionHash)
    .where((where) =>
      where.or([where('task_id', '=', query.taskID), where('thread', '=', query.taskID)]),
    )
    .where('state', '=', 'declined')
    .where((where) =>
      where.exists(
        where
          .selectFrom('records')
          .select('records.sequence')
          .where('records.kind', '=', proposalsSettledCodec.kind)
          .where('records.sequence', '>', query.afterSequence)
          .where(
            sql`json_extract(records.payload, '$.proposalID')`,
            '=',
            where.ref('proposals.proposal_id'),
          )
          .where(sql`json_extract(records.payload, '$.outcome')`, '=', 'declined'),
      ),
    )
    .orderBy('created_sequence', 'desc')
    .executeTakeFirst();

  return row === undefined ? null : row.short_id;
}
