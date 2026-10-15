import { canSessionTake } from './can-session-take';
import type { LiveSessionPosition, SessionPosition } from './types';

// whether the session's transition table lets a turn resume the session at the position
export function isSessionLive(position: SessionPosition): position is LiveSessionPosition {
  return canSessionTake(position.state, 'resume');
}
