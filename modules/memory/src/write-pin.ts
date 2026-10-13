import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { readDeliverableItems } from './read-deliverable-items';
import { readPinnedItems } from './read-pinned-items';
import { requirePinnedCoreRoom } from './require-pinned-core-room';
import type { MemoryTables, PinRequest, StoreParts } from './types';

// Puts an active item in the pinned core or takes an item out of it. A pin adds no version, because
// it changes where the item shows and not what it says. A pin that would take the core past its
// token budget fails, because the core rides in the cached start of every turn.
export function writePin(parts: StoreParts, request: PinRequest): Promise<void> {
  const log = parts.context.log;

  return parts.lock(async () => {
    if (request.isPinned) {
      await requireItemCoreRoom(parts, request.itemID);
    }
    await withWriteTransaction(log.writer, async (tx) => {
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
    });
  });
}

// an item a pin cannot read, gone or not active, takes no room, and the transaction refuses it
async function requireItemCoreRoom(parts: StoreParts, itemID: string): Promise<void> {
  const pinned = await readPinnedItems(parts);
  const [item] = await readDeliverableItems(parts, {
    itemIDs: [itemID],
    states: ['active'],
    includeHistory: false,
  });

  if (item !== undefined) {
    requirePinnedCoreRoom(parts.context, pinned, item);
  }
}
