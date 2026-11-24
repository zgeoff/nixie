import type { MovedCounts } from './types';

// `1 active, 32 retired`; a state with no item is left out
export function formatMovedCounts(counts: MovedCounts): string {
  return [
    ...(counts.active === 0 ? [] : [`${String(counts.active)} active`]),
    ...(counts.retired === 0 ? [] : [`${String(counts.retired)} retired`]),
  ].join(', ');
}
