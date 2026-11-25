import type { Call } from '../types';
import type { CallEndedBy } from '../utils/call-ended-by';

export const connectingLimitMs = 30_000;
export const minuteMs = 60_000;

export type CallMove =
  | { readonly kind: 'end'; readonly callID: string; readonly endedBy: CallEndedBy }
  | { readonly kind: 'charge'; readonly callID: string; readonly minutes: number };

export interface CallFacts {
  readonly nowMs: number;

  // the calls whose speech session this process holds
  readonly sessionCallIDs: ReadonlySet<string>;
}

// A connecting call that gets no connect in 30 s ends as dropped. A live call whose speech session
// this process lost ends as dropped, and one that holds its session charges each started minute it
// has not paid.
export function pickCallMoves(calls: readonly Call[], facts: CallFacts): readonly CallMove[] {
  return calls.flatMap((call): CallMove[] => {
    if (call.state === 'connecting') {
      return facts.nowMs - call.startedAtMs >= connectingLimitMs
        ? [{ kind: 'end', callID: call.callID, endedBy: 'dropped' }]
        : [];
    }

    if (call.state !== 'live' || call.connectedAtMs === null) {
      return [];
    }

    if (!facts.sessionCallIDs.has(call.callID)) {
      return [{ kind: 'end', callID: call.callID, endedBy: 'dropped' }];
    }

    const startedMinutes = Math.floor((facts.nowMs - call.connectedAtMs) / minuteMs) + 1;

    return startedMinutes > call.minutes
      ? [{ kind: 'charge', callID: call.callID, minutes: startedMinutes - call.minutes }]
      : [];
  });
}
