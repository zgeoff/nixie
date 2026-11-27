import type { ErasureHandle, WriteTransaction } from '@heynixie/log';
import type { ItemErasureRequest } from '../item/erasure/build-item-erasable';
import type { Provenance, StoreParts, WriteInTransaction } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';

export interface ItemForgets {
  // read under the store lock, so a write queued ahead of the forget is in what it takes
  readonly readRequests: () => Promise<readonly ItemErasureRequest[]>;

  // an owner's forget is the user's; any other origin is the assistant's
  readonly provenance: Provenance;

  // runs in the start transaction of the first item, so a refusal rolls it back
  readonly writeInTransaction?: WriteInTransaction | undefined;

  // runs after the caller's hook in that same transaction, to check every item before any starts
  readonly validate?: ((tx: WriteTransaction) => Promise<void>) | undefined;
}

// A forget to its end: each item's start transaction and hide under the store lock, then every
// later step. Each item is one erasure, and the caller's hook rides with the first. A failure after
// the starts leaves the erasures open for finishForgets or the next start.
export async function runItemForgets(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  forget: ItemForgets,
): Promise<readonly string[]> {
  const requests = await parts.lock(async () => {
    const wanted = await forget.readRequests();

    for (const [index, request] of wanted.entries()) {
      const begun = await erasure.begin(request, {
        by: forget.provenance.origin === 'owner' ? 'user' : 'assistant',
        ...(index === 0 ? { writeInTransaction: runFirstStart(forget) } : {}),
      });

      if (begun.status === 'refused') {
        throw new MemoryItemNotFoundError(request.itemID);
      }
    }

    return wanted;
  });

  for (const request of requests) {
    await erasure.finish(request.itemID);
  }

  return requests.map((request) => request.itemID);
}

function runFirstStart(forget: ItemForgets) {
  return async (tx: WriteTransaction) => {
    await forget.writeInTransaction?.(tx);
    await forget.validate?.(tx);
  };
}
