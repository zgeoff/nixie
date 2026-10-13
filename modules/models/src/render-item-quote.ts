import type { MemoryItem } from './types';

// Renders the quote the gate checked an item against, as the line under the item that says how it
// came up, or no line when the item has no quote. The quote is JSON-quoted with the two Unicode
// line separators escaped too, so no break or quote mark in it leaves the one line.
export function renderItemQuote(item: Pick<MemoryItem, 'evidenceQuote'>): readonly string[] {
  if (item.evidenceQuote === null) {
    return [];
  }
  const quote = JSON.stringify(item.evidenceQuote)
    .replaceAll('\u2028', String.raw`\u2028`)
    .replaceAll('\u2029', String.raw`\u2029`);

  return [`  How it came up: ${quote}`];
}
