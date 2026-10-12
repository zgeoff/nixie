import type { StoreParts } from './types';
import type { NewVersion } from './write-version-in-transaction';

// Puts an item's current text in the index after its version commits, or drops an item that left
// the active state. The caller still holds the delivery lock.
export async function updateVersionIndex(
  parts: StoreParts,
  itemID: string,
  next: NewVersion,
): Promise<void> {
  await (next.state === 'active'
    ? parts.index.update({ itemID, text: next.text.text })
    : parts.index.remove(itemID));
}
