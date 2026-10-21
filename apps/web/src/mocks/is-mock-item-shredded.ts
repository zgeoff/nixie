import type { StoredMemoryItem } from './to-mock-memory-item';

export function isMockItemShredded(item: Pick<StoredMemoryItem, 'isShredded' | 'state'>): boolean {
  return item.isShredded ?? (item.state === 'forgetting' || item.state === 'forgotten');
}
