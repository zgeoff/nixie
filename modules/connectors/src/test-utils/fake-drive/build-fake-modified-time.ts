import type { FakeDriveState } from './types';

// The next time of change, a minute after the last, so a later write sorts first.
export function buildFakeModifiedTime(state: FakeDriveState): string {
  state.counter += 1;

  return new Date(Date.parse('2026-11-20T09:00:00Z') + state.counter * 60_000).toISOString();
}
