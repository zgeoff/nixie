import { createContext, use } from 'react';
import type { CallSession } from './create-call-session';
import type { CallSnapshot } from './types';

export interface CallState {
  readonly session: CallSession;
  readonly snapshot: CallSnapshot;
}

export const CallContext = createContext<CallState | undefined>(undefined);

// The call of this device, held above the router.
export function useCall(): CallState {
  const state = use(CallContext);

  if (state === undefined) {
    throw new Error('useCall needs a CallProvider above it');
  }

  return state;
}
