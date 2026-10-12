import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import type { MemoryTables, PinRequest, StoreParts } from './types';

// Puts an active item in the pinned core or takes an item out of it. A pin adds no version, because
// it changes where the item shows and not what it says.
export function writePin(parts: StoreParts, request: PinRequest): Promise<void> {
  const log = parts.context.log;

  return parts.lock(() =>
    withWriteTransaction(log.writer, async (tx) => {
      const item = await tx
        .$extendTables<MemoryTables>()
        .selectFrom('memory_items')
        .select('state')
        .where('item_id', '=', request.itemID)
        .executeTakeFirst();

      if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
        throw new MemoryItemNotFoundError(request.itemID);
      }
      if (request.isPinned && item.state !== 'active') {
        throw new MemoryStateError(request.itemID, 'pin', item.state);
      }
      await writeRecordsInTransaction(tx, log, [
        {
          kind: 'memory.pinned',
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: { itemID: request.itemID, isPinned: request.isPinned },
        },
      ]);
    }),
  );
}
