import type { Kysely } from 'kysely';
import type { ProposalTables } from './proposal-tables';

export interface DeclinedProposalQuery {
  readonly taskID: string;
  readonly actionHash: string;

  // only a proposal whose record came after this sequence counts
  readonly afterSequence: number;
}

// The short ID of the newest action proposal for the hash that the owner declined, among those
// that the task asked for or that sit on its thread and came after the sequence. Null when none.
export async function readDeclinedProposalSince(
  db: Kysely<unknown>,
  query: DeclinedProposalQuery,
): Promise<string | null> {
  const row = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select('short_id')
    .where('family', '=', 'action')
    .where('action_hash', '=', query.actionHash)
    .where((where) =>
      where.or([where('task_id', '=', query.taskID), where('thread', '=', query.taskID)]),
    )
    .where('created_sequence', '>', query.afterSequence)
    .where('state', '=', 'declined')
    .orderBy('created_sequence', 'desc')
    .executeTakeFirst();

  return row === undefined ? null : row.short_id;
}
