import { spendStore } from './spend-store';

export function readMockSpendStop() {
  const standing = spendStore.stops.all().findLast(() => true);

  return standing === undefined ? { state: 'clear' as const, routes: [] } : standing.stop;
}
