import { formatPlaceKey } from './format-place-key';
import { parsePlace } from './parse-place';
import type { Destination, PlaceKey } from './types';

// The one place that every destination of a held call names, as the exact key a card offers to
// trust. A call with no destination, a destination that is no place, or destinations in more than
// one place gets no offer.
export function buildPlaceOffer(destinations: readonly string[]): PlaceKey | null {
  const keys = destinations.map((destination) => toOfferKey(parsePlace(destination)));
  const [first] = keys;

  if (first === undefined || first === null) {
    return null;
  }

  const text = formatPlaceKey(first);

  return keys.every((key) => key !== null && formatPlaceKey(key) === text) ? first : null;
}

function toOfferKey(destination: Destination | null): PlaceKey | null {
  if (destination === null) {
    return null;
  }

  return destination.kind === 'site'
    ? { kind: 'site', domain: destination.domain, subdomains: false }
    : destination;
}
