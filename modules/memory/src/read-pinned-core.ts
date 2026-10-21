import { readPinnedItems } from './read-pinned-items';
import type { RecalledItem, StoreParts } from './types';

export function readPinnedCore(parts: StoreParts): Promise<readonly RecalledItem[]> {
  return parts.lock(() => readPinnedItems(parts));
}
