import { readDeliverableItems } from '../item/read-deliverable-items';
import type { Labels, StoreParts } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';

// The labels of the item as it stands, whatever revision the caller read.
export async function readItemLabels(parts: StoreParts, itemID: string): Promise<Labels> {
  const [item] = await parts.lock(() =>
    readDeliverableItems(parts, {
      itemIDs: [itemID],
      states: ['active', 'retired'],
      includeHistory: false,
    }),
  );

  if (item === undefined) {
    throw new MemoryItemNotFoundError(itemID);
  }

  return { gist: item.gist, topic: item.topic, triggers: item.triggers };
}
