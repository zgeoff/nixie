import { removeRecordKey } from '@heynixie/log';
import type { MemoryTables, StoreParts } from '../types';
import { readRecordKeyID } from '../utils/read-record-key-id';

// A forget that finishes between the preparation of a card and its storage never sees the card, so
// once the call's record holds it, this checks the items again. A forget that starts after the
// check finds the stored card and removes it, as the forget's own cleanup does.
export async function removeRetopicCardOfForgotten(
  parts: Pick<StoreParts, 'context'>,
  callSequence: number,
  itemIDs: readonly string[],
): Promise<void> {
  if (itemIDs.length === 0) {
    return;
  }

  const log = parts.context.log;

  const gone = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('item_id', 'in', itemIDs)
    .where('state', 'in', ['forgetting', 'forgotten'])
    .executeTakeFirst();

  if (gone === undefined) {
    return;
  }

  const keyID = await readRecordKeyID(log, callSequence);

  if (keyID !== null) {
    await removeRecordKey(log, keyID);
  }
}
