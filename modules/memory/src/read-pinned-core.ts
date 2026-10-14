import { readPinnedItems } from './read-pinned-items';
import type { RecalledItem, StoreParts } from './types';

// Reads the pinned core under the delivery lock, so the text of an item a forget began never
// reaches a session's opening.
export function readPinnedCore(parts: StoreParts): Promise<readonly RecalledItem[]> {
  return parts.lock(() => readPinnedItems(parts));
}
