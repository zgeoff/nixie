import type { Kysely } from 'kysely';
import type { ProposalTables } from './proposal-tables';

export interface OpenProposalQuery {
  readonly taskID: string;

  // only a proposal whose record came after this sequence counts
  readonly afterSequence: number;
}

// Whether a proposal that the task asked for, or that sits on its thread, came after the sequence
// and still waits for an answer.
export async function probeOpenProposalSince(
  db: Kysely<unknown>,
  query: OpenProposalQuery,
): Promise<boolean> {
  const row = await db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select('proposal_id')
    .where((where) =>
      where.or([where('task_id', '=', query.taskID), where('thread', '=', query.taskID)]),
    )
    .where('created_sequence', '>', query.afterSequence)
    .where('state', 'in', ['pending', 'deferred'])
    .executeTakeFirst();

  return row !== undefined;
}
