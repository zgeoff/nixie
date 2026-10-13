import type { MemoryItem } from './types';

// Renders the quote the gate checked an item against, as the line under the item that says how it
// came up, or no line when the item has no quote. The quote is JSON-quoted, so a line break or a
// quote mark in it stays on the one line.
export function renderItemQuote(item: Pick<MemoryItem, 'evidenceQuote'>): readonly string[] {
  return item.evidenceQuote === null
    ? []
    : [`  How it came up: ${JSON.stringify(item.evidenceQuote)}`];
}
