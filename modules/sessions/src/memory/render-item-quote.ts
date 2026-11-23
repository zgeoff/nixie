import { mintBlockID, renderFenced } from '@heynixie/wire';
import type { MemoryItem } from '../types';

// A quote is the user's or a page's own words, so it sits in a fence of its own that the quote
// cannot close.
export function renderItemQuote(
  item: Pick<MemoryItem, 'evidenceQuote'>,
  mint: () => string = mintBlockID,
): readonly string[] {
  if (item.evidenceQuote === null) {
    return [];
  }

  const fenced = renderFenced({
    tag: 'memory-quote',
    attributes: {},
    text: item.evidenceQuote,
    fence: mint(),
  });

  return [`  How it came up: ${fenced}`];
}
