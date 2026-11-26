import type { PeriodStore } from '../types';

// The revision of the next write of a sandbox's limit: above every revision the store has given,
// including those of sandboxes it has since removed.
export function pickNextLimitRevision(store: PeriodStore, name: string): number {
  const held = Object.hasOwn(store.sandboxes, name) ? store.sandboxes[name] : undefined;

  return Math.max(store.lastLimitRevision ?? 0, held?.limitRevision ?? 0) + 1;
}
