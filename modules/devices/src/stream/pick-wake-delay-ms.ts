import type { ScreenState } from '../types';

// How long until a screen changes with no record to say so: the time a show has left, or null for
// a screen that only a record changes.
export function pickWakeDelayMs(state: ScreenState, nowMs: number): number | null {
  if (state.kind !== 'show' || state.until === null) {
    return null;
  }

  return Math.max(Date.parse(state.until) - nowMs, 1);
}
