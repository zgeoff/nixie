import type { ErasureHandle } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type {
  ItemErasureRequest,
  MemoryTables,
  Provenance,
  StoreParts,
  WriteInTransaction,
} from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { requireItem } from '../utils/item/require-item';

export interface ItemForgets {
  // read under the store lock, so a write queued ahead of the forget is in what it takes
  readonly readRequests: () => Promise<readonly ItemErasureRequest[]>;

  // an owner's forget is the user's; any other origin is the assistant's
  readonly provenance: Provenance;

  // runs in the start transaction of the last item to start, so the caller's record of the forget
  // commits only once every item has begun, and a refusal rolls it back
  readonly writeInTransaction?: WriteInTransaction | undefined;

  // stops after the starts and hides, and leaves every later step to finishForgets
  readonly isFinishDeferred?: boolean | undefined;
}

// A forget to its end: each item's start transaction and hide under the store lock, then every
// later step. An item that is already forgetting joins its open erasure. Every revision is checked
// before any item starts, and the caller's hook rides with the last start.
export async function runItemForgets(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  forget: ItemForgets,
): Promise<readonly string[]> {
  const requests = await parts.lock(async () => {
    const wanted = await forget.readRequests();
    const starting = await readStartingRequests(parts, wanted);

    for (const [index, request] of starting.entries()) {
      const begun = await erasure.begin(request, {
        by: forget.provenance.origin === 'owner' ? 'user' : 'assistant',
        ...(index === starting.length - 1 && forget.writeInTransaction !== undefined
          ? { writeInTransaction: forget.writeInTransaction }
          : {}),
      });

      if (begun.status === 'refused') {
        throw new MemoryItemNotFoundError(request.itemID);
      }
    }

    if (starting.length === 0 && forget.writeInTransaction !== undefined) {
      const write = forget.writeInTransaction;

      await withWriteTransaction(parts.context.log.writer, (tx) => write(tx));
    }

    return wanted;
  });

  if (forget.isFinishDeferred !== true) {
    for (const request of requests) {
      await erasure.finish(request.itemID);
    }
  }

  return requests.map((request) => request.itemID);
}

// The requests of items that are not forgetting yet, each checked against the revision its caller
// saw. A request for an item that is forgetting is left out, because its erasure is open.
async function readStartingRequests(
  parts: StoreParts,
  wanted: readonly ItemErasureRequest[],
): Promise<readonly ItemErasureRequest[]> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const rows = await db
    .selectFrom('memory_items')
    .select(['item_id', 'state'])
    .where(
      'item_id',
      'in',
      wanted.map((request) => request.itemID),
    )
    .execute();

  const forgetting = new Set(
    rows.filter((row) => row.state === 'forgetting').map((row) => row.item_id),
  );

  const starting = wanted.filter((request) => !forgetting.has(request.itemID));

  for (const request of starting) {
    if (request.revision !== null) {
      await requireItem(db, {
        target: { itemID: request.itemID, version: request.revision },
        operation: 'forget',
        states: request.states,
      });
    }
  }

  return starting;
}
