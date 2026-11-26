import type { Log } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';

const rowSchema = z.object({ recorded_at: z.number() });

// The time the queue recorded the action, in epoch seconds, which stays the same across attempts and
// checks. Null when the queue holds no such action.
export async function readQueuedSeconds(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<number | null> {
  const result = await sql`
    select records.recorded_at
    from actions
    join records on records.sequence = actions.queued_sequence
    where actions.action_id = ${actionID}
  `.execute(log.writer.db);

  const row = rowSchema.safeParse(result.rows[0]);

  return row.success ? Math.floor(row.data.recorded_at / 1000) : null;
}
