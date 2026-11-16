import type { IndexRow } from '../index-block/read-index-rows';

// `count` owner items of one topic, with createdSequence counting up from `first`.
export function buildIndexRows(topic: string, count: number, first = 1): readonly IndexRow[] {
  return Array.from({ length: count }, (_, index) => ({
    shortID: `${topic.slice(0, 2)}${String(first + index).padStart(8, '0')}`,
    subject: 'owner' as const,
    topic,
    gist: `${topic} fact number ${String(first + index)} about the household`,
    createdSequence: first + index,
  }));
}
