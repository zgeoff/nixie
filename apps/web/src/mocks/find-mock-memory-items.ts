import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';
import { toMockMemoryItem } from './to-mock-memory-item';

// Finds the active items whose current text holds a word of the query, most matching words first,
// each with that count as its keyword score. nixie's API ranks with its recall indexes; the mock
// stands in with whole-word matches, which a test that searches by a word in an item relies on.
export function findMockMemoryItems(query: string) {
  const words = new Set(splitWords(query));

  const matches = store.memoryItems
    .all()
    .filter((item) => item.state === 'active')
    .map((item) => ({
      item,
      score: splitWords(item.versions.at(-1)?.text ?? '').filter((word) => words.has(word)).length,
    }))
    .filter((match) => match.score > 0)
    .toSorted((left, right) => right.score - left.score);

  return {
    items: matches.map((match) => toMockMatch(match.item, match.score)),
    searchMode: 'keyword' as const,
  };
}

// an item with its keyword score, as nixie's API lists a match
function toMockMatch(item: StoredMemoryItem, score: number) {
  return { ...toMockMemoryItem(item), score };
}

function splitWords(text: string): readonly string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
