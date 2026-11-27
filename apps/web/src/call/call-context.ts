import { createContext, use } from 'react';
import type { CallSession } from './create-call-session';
import type { CallSnapshot } from './types';

// The proposals the call screen has seen for one call's thread, held with the call so leaving the
// screen and coming back keeps the cards.
export interface SeenProposals {
  readonly thread: string | null;
  readonly ids: readonly string[];
}

export interface CallState {
  readonly session: CallSession;
  readonly snapshot: CallSnapshot;
  readonly seenProposals: SeenProposals;
  readonly setSeenProposals: (seen: SeenProposals) => void;
}

export const CallContext = createContext<CallState | undefined>(undefined);

// The call of this device while the voice feature is on, or undefined while it is off, for a page
// that works either way.
export function useCallWhenOn(): CallState | undefined {
  return use(CallContext);
}

// The call of this device, held above the router.
export function useCall(): CallState {
  const state = useCallWhenOn();

  if (state === undefined) {
    throw new Error('useCall needs a CallProvider above it');
  }

  return state;
}
