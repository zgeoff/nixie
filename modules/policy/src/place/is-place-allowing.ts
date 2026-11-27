import type { Effect } from '../types';
import { isReadingCall } from './is-reading-call';
import type { Trust } from './types';

// Whether a place at this level allows a call with these effects. No level allows a spend call.
export function isPlaceAllowing(trust: Trust, effects: readonly Effect[]): boolean {
  if (effects.includes('spend')) {
    return false;
  }

  if (trust === 'read') {
    return isReadingCall(effects);
  }

  return trust === 'act' || trust === 'self';
}
