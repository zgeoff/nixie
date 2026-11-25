import { createShortID } from '@heynixie/db';
import type { Kysely, Transaction } from 'kysely';
import type { MailTables } from '../types';

// The thread of the stored mail that a new mail answers, or a new thread when it answers none.
export async function readThreadShortID(
  db: Kysely<unknown> | Transaction<unknown>,
  referenceHashes: readonly string[],
): Promise<string> {
  if (referenceHashes.length === 0) {
    return createShortID();
  }

  const row = await db
    .$extendTables<MailTables>()
    .selectFrom('mail_messages')
    .select('thread_short_id')
    .where('header_hash', 'in', [...referenceHashes])
    .orderBy('received_at', 'desc')
    .executeTakeFirst();

  return row?.thread_short_id ?? createShortID();
}
