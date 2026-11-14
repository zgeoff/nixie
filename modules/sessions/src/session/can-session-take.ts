import type { SessionEvent, SessionState } from '../types';
import { sessionTransitions } from './session-transitions';

export function canSessionTake(state: SessionState, event: SessionEvent): boolean {
  return sessionTransitions[state][event] !== undefined;
}
