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

// What an approval card offers when every destination of the held call is one place: the place in
// words, and the hash that the answer of each level echoes. Nothing is stored: the card derives it
// again from the call's destinations, so a forget of the call takes the offer with it.
export function buildCardPlaceOffer(destinations: readonly string[]): CardPlaceOffer | null {
  const key = buildPlaceOffer(destinations);

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
