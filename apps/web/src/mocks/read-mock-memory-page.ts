import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

interface PageRequest {
  readonly state: 'active' | 'retired' | 'forgotten';
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
}

// Reads one page of the items in a state, in the order the store created them, as nixie's API
// does. The forgotten page holds each item a forget began. A cursor no page returned reads as null.
export function readMockMemoryPage(request: PageRequest) {
  const start = request.after === undefined ? 0 : Number(request.after);

  if (!Number.isSafeInteger(start) || start < 0) {
    return null;
  }

  const states = request.state === 'forgotten' ? ['forgetting', 'forgotten'] : [request.state];
  const limit = request.limit ?? 50;

  const matching = store.memoryItems
    .all()
    .filter((item) => states.includes(item.state))
    .slice(start);

  return {
    items: matching.slice(0, limit).map((item) => toMockMemoryItem(item)),
    next: matching.length > limit ? String(start + limit) : null,
  };
}
