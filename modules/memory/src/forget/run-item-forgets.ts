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

  // runs before any item starts, so a refused request begins nothing
  readonly checkInTransaction?: WriteInTransaction | undefined;

  // stops after the starts and hides, and leaves every later step to finishForgets
  readonly isFinishDeferred?: boolean | undefined;
}

// A forget to its end: each item's start transaction and hide under the store lock, then every
// later step. An item that is already forgetting joins its open erasure. The caller's check and
// every revision run before any item starts, and the caller's hook rides with the last start.
export async function runItemForgets(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  forget: ItemForgets,
): Promise<readonly string[]> {
  const requests = await parts.lock(async () => {
    const wanted = await forget.readRequests();

    if (forget.checkInTransaction !== undefined) {
      const check = forget.checkInTransaction;

      await withWriteTransaction(parts.context.log.writer, (tx) => check(tx));
    }

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
// saw. An item that is forgetting is left out, because its erasure is open. A forgotten item is
// left out when another has not begun, which is what a stop between two starts and a restart leave.
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

  const states = new Map(rows.map((row) => [row.item_id, row.state]));

  const isBegun = (request: ItemErasureRequest) =>
    states.get(request.itemID) === 'forgetting' || states.get(request.itemID) === 'forgotten';

  const hasUnbegun = wanted.some((request) => !isBegun(request));

  const starting = wanted.filter(
    (request) =>
      states.get(request.itemID) !== 'forgetting' &&
      !(hasUnbegun && states.get(request.itemID) === 'forgotten'),
  );

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
