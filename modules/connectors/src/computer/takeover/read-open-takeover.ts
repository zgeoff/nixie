import { conversationTaskID } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// When the newest hold on the desktop started, if no record has ended it: a hold that a restart cut
// short. It reads the start record's time, in epoch milliseconds.
const newestSchema = z.object({ kind: z.string(), recorded_at: z.number() });

export async function readOpenTakeover(db: Kysely<unknown>): Promise<number | null> {
  const result = await sql`
    select kind, recorded_at from records
    where thread = ${conversationTaskID}
      and kind in ('computer.takeover_started', 'computer.takeover_ended')
    order by sequence desc
    limit 1
  `.execute(db);

  const [newest] = z.array(newestSchema).parse(result.rows);

  return newest?.kind === 'computer.takeover_started' ? newest.recorded_at : null;
}
