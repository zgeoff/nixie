import type { StoreParts } from './types';
import type { NewVersion } from './write-version-in-transaction';

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
