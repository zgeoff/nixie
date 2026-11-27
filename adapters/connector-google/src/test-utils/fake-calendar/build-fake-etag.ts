import type { FakeCalendarState } from './types';

// The next version tag of an event, which each write of the fake changes.
export function buildFakeEtag(state: FakeCalendarState): string {
  state.version += 1;

  return `"etag-${String(state.version)}"`;
}
