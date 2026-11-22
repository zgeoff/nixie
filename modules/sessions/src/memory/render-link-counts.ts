import type { MemoryItem } from '../types';

// The counts of the notes that argue with an item, such as `(disputed by 1 note · superseded by
// 2 notes)`, or null when no note does.
export function renderLinkCounts(
  item: Pick<MemoryItem, 'disputedBy' | 'supersededBy'>,
): string | null {
  const parts = [
    renderCount('disputed', item.disputedBy ?? 0),
    renderCount('superseded', item.supersededBy ?? 0),
  ].filter((part) => part !== null);

  return parts.length === 0 ? null : `(${parts.join(' · ')})`;
}

function renderCount(verb: string, count: number): string | null {
  if (count === 0) {
    return null;
  }

  return `${verb} by ${String(count)} ${count === 1 ? 'note' : 'notes'}`;
}
