import { buildPlaceHash } from './build-place-hash';
import { buildPlaceOffer } from './build-place-offer';
import { formatPlaceWords } from './format-place-words';
import type { PlaceKey } from './types';

export interface CardPlaceOffer {
  readonly key: PlaceKey;
  readonly words: string;
  readonly readHash: string;
  readonly actHash: string;
}

// An ask that trusting a place would settle: the destination has no permission, no rule steers the
// call, or you asked for it. A rule that asks, a repeat, and a call that always asks stay asks
// whatever a place holds.
const offeringCauses: ReadonlySet<string> = new Set([
  'outside_steering',
  'no_rule',
  'direct_request',
]);

// What an approval card offers when every destination of the held call is one place: the place in
// words, and the hash that the answer of each level echoes. Nothing is stored: the card derives it
// again from the call's destinations, so a forget of the call takes the offer with it.
export function buildCardPlaceOffer(
  cause: string,
  destinations: readonly string[],
): CardPlaceOffer | null {
  const key = offeringCauses.has(cause) ? buildPlaceOffer(destinations) : null;

  if (key === null || key.kind === 'raw') {
    return null;
  }

  return {
    key,
    words: formatPlaceWords(key),
    readHash: buildPlaceHash(key, 'read'),
    actHash: buildPlaceHash(key, 'act'),
  };
}
