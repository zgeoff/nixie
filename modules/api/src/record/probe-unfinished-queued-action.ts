import { probeActionUnfinished } from '@heynixie/actions';
import type { Kysely } from 'kysely';
import type { APITables } from '../types';

interface RecordTarget {
  // null reads the record on any thread
  readonly thread: string | null;
  readonly sequence: number;
}

// An action reads its arguments from the record that queued it, so the record stays until the
// action has run or was cancelled.
export async function probeUnfinishedQueuedAction(
  db: Kysely<unknown>,
  target: RecordTarget,
): Promise<boolean> {
  const queued = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('sequence', '=', target.sequence)
    .$if(target.thread !== null, (query) => query.where('thread', '=', target.thread))
    .where('kind', '=', 'action.queued')
    .executeTakeFirst();

  if (queued === undefined) {
    return false;
  }

  return probeActionUnfinished(db, target.sequence);
}
