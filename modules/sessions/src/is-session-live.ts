import { canSessionTake } from './can-session-take';
import type { LiveSessionPosition, SessionPosition } from './types';

export function isSessionLive(position: SessionPosition): position is LiveSessionPosition {
  return canSessionTake(position.state, 'resume');
}
