import { sessionTransitions } from './session-transitions';
import type { SessionEvent, SessionState } from './types';

export function canSessionTake(state: SessionState, event: SessionEvent): boolean {
  return sessionTransitions[state][event] !== undefined;
}
