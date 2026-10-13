import { formatOrigin } from './format-origin';
import { renderItemQuote } from './render-item-quote';
import type { MemoryItem } from './types';

// Renders one pinned item as the system prompt holds it: its ID, who saved it and its text, with
// the quote it came up in on the line under it. The pinned core's budget counts these lines.
export function renderPinnedItem(
  item: Pick<MemoryItem, 'itemID' | 'origin' | 'text' | 'evidenceQuote'>,
  ownerName: string | null,
): readonly string[] {
  return [
    `- [${item.itemID}, ${formatOrigin(item.origin, ownerName)}] ${item.text}`,
    ...renderItemQuote(item),
  ];
}
