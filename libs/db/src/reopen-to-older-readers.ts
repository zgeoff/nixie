import type { Transaction } from 'kysely';
import { sql } from 'kysely';

export async function reopenToOlderReaders(tx: Transaction<unknown>): Promise<void> {
  await sql`update schema_version
    set oldest_reader = open_oldest_reader, open_oldest_reader = null
    where id = 1 and open_oldest_reader is not null`.execute(tx);
}
