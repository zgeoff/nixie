import type { ReactNode } from 'react';
import type { MemoryItem } from '../types';
import { MemoryItemActions } from './memory-item-actions';
import { MemoryItemRow } from './memory-item-row';

// Every list renders an item the same way, so a control on an item joins every list here. A
// refused change's reason goes to the view as a notice that names the item.
export function makeMemoryItemRenderer(onNotice: (notice: string | null) => void) {
  return (item: MemoryItem): ReactNode => (
    <MemoryItemRow key={item.itemID} item={item}>
      <MemoryItemActions
        item={item}
        onSettled={(reason) => {
          onNotice(formatNotice(item.shortID, reason));
        }}
      />
    </MemoryItemRow>
  );
}

function formatNotice(shortID: string, reason: string | null): string | null {
  return reason === null ? null : `Item ${shortID}: ${reason}`;
}
