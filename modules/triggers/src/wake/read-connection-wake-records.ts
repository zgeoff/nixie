import { triggerMailWokeCodec } from '@heynixie/tasks';
import type { QueryExecutorProvider } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ConnectionMailbox } from '../types';
import { buildMailboxKey } from './build-mailbox-key';

export interface ConnectionWakeRecord {
  readonly sequence: number;

  // the thread of the woken task
  readonly thread: string;

  // the key that seals the sender and the subject of the wake's mails; null once removed
  readonly keyID: string | null;
}

const rowSchema = z.object({
  sequence: z.int(),
  thread: z.string(),
  key_id: z.string().nullable(),
});

// The wakes that show mail of one connection, from the one that woke first. A wake that shows
// mail of other mailboxes too is one of them, because its mails share one key.
export async function readConnectionWakeRecords(
  executor: QueryExecutorProvider,
  connection: ConnectionMailbox,
): Promise<readonly ConnectionWakeRecord[]> {
  const mailbox = buildMailboxKey(connection);

  const result = await sql`
    select sequence, thread, key_id
    from records
    where kind = ${triggerMailWokeCodec.kind}
      and thread is not null
      and exists (
        select 1 from json_each(records.payload, '$.mails')
        where json_extract(json_each.value, '$.mailbox') = ${mailbox}
      )
    order by sequence
  `.execute(executor);

  return result.rows.map((row) => {
    const parsed = rowSchema.parse(row);

    return { sequence: parsed.sequence, thread: parsed.thread, keyID: parsed.key_id };
  });
}
