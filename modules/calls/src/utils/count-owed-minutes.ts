import type { Call } from '../types';

const minuteMs = 60_000;

// A live call pays for each minute it has started, the first one included. The count is what the
// call has started and not yet paid.
export function countOwedMinutes(call: Call, nowMs: number): number {
  if (call.state !== 'live' || call.connectedAtMs === null) {
    return 0;
  }

  const startedMinutes = Math.floor((nowMs - call.connectedAtMs) / minuteMs) + 1;

  return Math.max(0, startedMinutes - call.minutes);
}
