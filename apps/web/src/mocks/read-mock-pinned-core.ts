import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

const budget = 2000;
const charactersPerToken = 4;

export function readMockPinnedCore() {
  const pinned = store.memoryItems
    .all()
    .filter((item) => item.isPinned && item.state === 'active')
    .toSorted((left, right) => left.pinnedSequence - right.pinnedSequence)
    .map((item) => toMockMemoryItem(item));

  const tokens = pinned.reduce(
    (total, item) => total + Math.ceil((item.text ?? '').length / charactersPerToken),
    0,
  );

  return { budget, items: pinned, tokens };
}
