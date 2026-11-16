import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';
import type { ItemValueKey } from './types';

// The key a writer seals a new value under: the item's newest generation key that no purge has
// closed, or the item's own ID before any purge. Pass the transaction as `db` from inside a write
// transaction.
export async function readCurrentItemKey(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemID: string,
  db: Kysely<unknown> = log.writer.db,
): Promise<ItemValueKey> {
  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_item_keys')
    .select(['key_id', 'from_sequence', 'removed_sequence'])
    .where('item_id', '=', itemID)
    .where('kind', '=', 'generation')
    .orderBy('from_sequence', 'desc')
    .execute();

  const [newest] = rows;

  if (typeof newest?.removed_sequence === 'number') {
    return { status: 'removed' };
  }

  const keyID = newest?.key_id ?? itemID;

  const keys = await readRecordKeys(log, [keyID]);

  const key = keys.get(keyID);

  if (key === undefined) {
    return { status: 'shredded' };
  }

  return key === null ? { status: 'unreadable' } : { status: 'readable', keyID, key };
}
