import type { Transaction } from 'kysely';
import { sql } from 'kysely';

// The gate is set from the open value, never from the gate before it, so a pause whose cause changes
// from spending to another cause lowers the gate to that cause's version.
export async function closeToOlderReaders(tx: Transaction<unknown>, reader: number): Promise<void> {
  await sql`update schema_version set open_oldest_reader = oldest_reader
    where id = 1 and open_oldest_reader is null`.execute(tx);

  await sql`update schema_version set oldest_reader = max(open_oldest_reader, ${reader})
    where id = 1`.execute(tx);
}
