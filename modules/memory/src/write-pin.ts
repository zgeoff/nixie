import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { readDeliverableItems } from './read-deliverable-items';
import { readPinnedItems } from './read-pinned-items';
import { requirePinnedCoreRoom } from './require-pinned-core-room';
import { StaleVersionError } from './stale-version-error';
import type { MemoryState, MemoryTables, PinRequest, StoreParts } from './types';

export function writePin(parts: StoreParts, request: PinRequest): Promise<void> {
  const log = parts.context.log;

  return parts.lock(() =>
    withWriteTransaction(log.writer, async (tx) => {
      await request.writeInTransaction?.(tx);

      await requirePinnableItem(parts, tx, request);

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

async function requirePinnableItem(
  parts: StoreParts,
  tx: Transaction<unknown>,
  request: PinRequest,
): Promise<void> {
  const db = tx.$extendTables<MemoryTables>();

  const item = await db
    .selectFrom('memory_items')
    .select(['state', 'version'])
    .where('item_id', '=', request.itemID)
    .executeTakeFirst();

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    throw new MemoryItemNotFoundError(request.itemID);
  }

  if (request.version !== undefined && request.version !== item.version) {
    throw new StaleVersionError({ itemID: request.itemID, version: request.version }, item.version);
  }

  if (request.isPinned) {
    await requireItemJoinsCore(parts, db, { itemID: request.itemID, ...item });
  }
}

interface PinnedItem {
  readonly itemID: string;
  readonly state: MemoryState;
}

async function requireItemJoinsCore(
  parts: StoreParts,
  db: Kysely<MemoryTables>,
  item: PinnedItem,
): Promise<void> {
  if (item.state !== 'active') {
    throw new MemoryStateError(item.itemID, 'pin', item.state);
  }

  await requireItemCoreRoom(parts, db, item.itemID);
}

async function requireItemCoreRoom(
  parts: StoreParts,
  db: Kysely<MemoryTables>,
  itemID: string,
): Promise<void> {
  const pinned = await readPinnedItems(parts, db);

  const [readable] = await readDeliverableItems(parts, {
    itemIDs: [itemID],
    states: ['active'],
    includeHistory: false,
    db,
  });

  if (readable !== undefined) {
    requirePinnedCoreRoom(parts.context, pinned, readable);
  }
}
