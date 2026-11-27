import type { Log } from '@heynixie/log';
import type { PhoneTables } from '../types';

// The provider message IDs, among those given, of the texts that nixie stored. A forgotten text
// keeps its row, so it counts as stored and is never stored again.
export async function readStoredMessageIDs(
  log: Pick<Log, 'writer'>,
  messageIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (messageIDs.length === 0) {
    return new Set();
  }

  const rows = await log.writer.db
    .$extendTables<PhoneTables>()
    .selectFrom('phone_texts')
    .select('message_id')
    .where('message_id', 'in', messageIDs)
    .execute();

  return new Set(rows.map((row) => row.message_id));
}
