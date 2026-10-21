import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';
import { toMockMemoryItem } from './to-mock-memory-item';

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

function splitWords(text: string): readonly string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function toMockMatch(item: StoredMemoryItem, score: number) {
  return { ...toMockMemoryItem(item), score };
}
