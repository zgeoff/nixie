import type { Log } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';

// Removes the key of the record at the sequence, the way a forget of your message lands, so its
// erasable fields read as gone. A record with no key throws.
export async function removeMessageKey(log: Pick<Log, 'writer'>, sequence: number): Promise<void> {
  const row = await log.writer.db
    .$extendTables<{ records: { sequence: number; key_id: string | null } }>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (typeof row?.key_id !== 'string') {
    throw new TypeError(`the record ${String(sequence)} has no key`);
  }

  await removeRecordKey(log, row.key_id);
}
