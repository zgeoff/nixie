import type { MemoryState } from './types';

export interface ItemEnd {
  readonly state: MemoryState;
  readonly until: number | null;
}

export function isItemLapsed(item: ItemEnd, now: number): boolean {
  return item.state === 'active' && item.until !== null && item.until <= now;
}
