import type { StoreParts } from './types';
import type { NewVersion } from './write-version-in-transaction';

// Puts an item's current text in the keyword index after its version commits, and queues it for the
// vector index outside the write transaction, or drops an item that left the active state from
// both. The caller still holds the delivery lock.
export async function updateVersionIndex(
  parts: StoreParts,
  itemID: string,
  next: NewVersion,
): Promise<void> {
  if (next.state === 'active') {
    await parts.index.update({ itemID, text: next.text.text });

    parts.vectors?.update({ itemID, text: next.text.text });
  } else {
    await parts.index.remove(itemID);

    parts.vectors?.remove(itemID);
  }
}
