import type { MemoryItem } from './types';

export function renderItemQuote(item: Pick<MemoryItem, 'evidenceQuote'>): readonly string[] {
  if (item.evidenceQuote === null) {
    return [];
  }

  // JSON.stringify leaves U+2028 and U+2029 bare, and a reader can take either as a line break.
  const quote = JSON.stringify(item.evidenceQuote)
    .replaceAll('\u2028', String.raw`\u2028`)
    .replaceAll('\u2029', String.raw`\u2029`);

  return [`  How it came up: ${quote}`];
}
