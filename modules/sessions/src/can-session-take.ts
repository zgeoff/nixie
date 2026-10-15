import { sessionTransitions } from './session-transitions';
import type { SessionEvent, SessionState } from './types';

// whether the session's transition table allows the event in the state
export function canSessionTake(state: SessionState, event: SessionEvent): boolean {
  return sessionTransitions[state][event] !== undefined;
}
