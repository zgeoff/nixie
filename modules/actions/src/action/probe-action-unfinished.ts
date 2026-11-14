import type { Kysely } from 'kysely';
import type { ActionsTables } from '../types';

// An action that has neither an outcome nor a cancel still has to run, and its arguments are
// erasable fields that its run reads.
export async function probeActionUnfinished(
  db: Kysely<unknown>,
  queuedSequence: number,
): Promise<boolean> {
  const row = await db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('action_id')
    .where('queued_sequence', '=', queuedSequence)
    .where('outcome_sequence', 'is', null)
    .where('cancelled_sequence', 'is', null)
    .executeTakeFirst();

  return row !== undefined;
}
