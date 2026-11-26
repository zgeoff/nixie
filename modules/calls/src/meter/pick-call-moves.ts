import type { Call } from '../types';
import type { CallEndedBy } from '../utils/call-ended-by';
import { countOwedMinutes } from '../utils/count-owed-minutes';

const connectingLimitMs = 30_000;

// how long a live call with no speech session waits for the device's new offer
export const reconnectLimitMs = 30_000;

export type CallMove =
  | { readonly kind: 'end'; readonly callID: string; readonly endedBy: CallEndedBy }
  | { readonly kind: 'wait'; readonly callID: string }
  | { readonly kind: 'charge'; readonly callID: string; readonly minutes: number };

export interface CallFacts {
  readonly nowMs: number;

  // the calls whose speech session this process holds
  readonly sessionCallIDs: ReadonlySet<string>;

  // the calls that wait for a new offer, with the time each began to wait
  readonly reconnectSinceMs: ReadonlyMap<string, number>;
}

// A connecting call that gets no connect in 30 s ends as dropped. A live call whose session this
// process lost waits for the device's new offer and ends as dropped after 30 s. One that holds its
// session charges each started minute it has not paid.
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
      const sinceMs = facts.reconnectSinceMs.get(call.callID);

      if (sinceMs === undefined) {
        return [{ kind: 'wait', callID: call.callID }];
      }

      return facts.nowMs - sinceMs >= reconnectLimitMs
        ? [{ kind: 'end', callID: call.callID, endedBy: 'dropped' }]
        : [];
    }

    const owed = countOwedMinutes(call, facts.nowMs);

    return owed > 0 ? [{ kind: 'charge', callID: call.callID, minutes: owed }] : [];
  });
}
