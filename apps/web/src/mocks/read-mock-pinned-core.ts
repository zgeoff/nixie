import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

// the pinned core's budget in tokens when the deployment sets none, as nixie's memory store has it
const budget = 2000;

// Reads the pinned core as nixie's API does: every pinned active item and its size against its
// budget. The mock counts a token for each 4 characters of text, where nixie counts as the
// session's opening renders each item.
export function readMockPinnedCore() {
  const pinned = store.memoryItems
    .all()
    .filter((item) => item.isPinned && item.state === 'active')
    .map((item) => toMockMemoryItem(item));

  const tokens = pinned.reduce(
    (total, item) => total + Math.ceil((item.text ?? '').length / charactersPerToken),
    0,
  );

  return { budget, items: pinned, tokens };
}

const charactersPerToken = 4;
