import { createHash } from 'node:crypto';
import { toCanonicalText } from '../utils/to-canonical-text';
import { formatPlaceKey } from './format-place-key';
import type { PlaceKey } from './types';

// The hash a card carries for one answer of "Trust this place", over the key and the level the card
// shows, so an answer for one place or one level never trusts another.
export function buildPlaceHash(key: PlaceKey, trust: 'read' | 'act'): string {
  return createHash('sha256')
    .update(toCanonicalText({ kind: key.kind, place: formatPlaceKey(key), trust }))
    .digest('hex');
}
