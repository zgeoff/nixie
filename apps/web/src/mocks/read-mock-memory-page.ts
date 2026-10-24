import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

interface PageRequest {
  readonly state: 'active' | 'retired' | 'forgotten';
  readonly after?: string | undefined;
  readonly kind?: 'fact' | 'self' | undefined;
  readonly limit?: number | undefined;
}

export function readMockMemoryPage(request: PageRequest) {
  const start = request.after === undefined ? 0 : Number(request.after);

  if (!Number.isSafeInteger(start) || start < 0) {
    return null;
  }

  const states = request.state === 'forgotten' ? ['forgetting', 'forgotten'] : [request.state];
  const limit = request.limit ?? 50;

  const matching = store.memoryItems
    .all()
    .map((item) => toMockMemoryItem(item))
    .filter((item) => states.includes(item.state))
    .filter((item) => request.kind === undefined || item.kind === request.kind)
    .toReversed()
    .slice(start);

  return {
    items: matching.slice(0, limit),
    next: matching.length > limit ? String(start + limit) : null,
  };
}
