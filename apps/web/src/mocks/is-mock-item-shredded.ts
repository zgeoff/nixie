import type { StoredMemoryItem } from './to-mock-memory-item';

// Whether an item's texts no longer open, as nixie reads an item whose key is gone. A forget removes
// the key in its cleanup, so a forgetting item keeps its texts until that cleanup runs.
export function isMockItemShredded(item: Pick<StoredMemoryItem, 'isShredded' | 'state'>): boolean {
  return item.isShredded ?? (item.state === 'forgetting' || item.state === 'forgotten');
}
