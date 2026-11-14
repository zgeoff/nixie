import type { LiveSessionPosition, SessionPosition } from '../types';
import { canSessionTake } from './can-session-take';

export function isSessionLive(position: SessionPosition): position is LiveSessionPosition {
  return canSessionTake(position.state, 'resume');
}
