import type { RecalledItem, StoreParts } from '../types';
import { readPinnedItems } from './read-pinned-items';

export function readPinnedCore(parts: StoreParts): Promise<readonly RecalledItem[]> {
  return parts.lock(() => readPinnedItems(parts));
}
