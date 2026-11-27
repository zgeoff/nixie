import { isPlaceCovered } from './is-place-covered';
import type { DestinationText, PlaceEntry, PlaceKey } from './types';
import { trustLevels } from './types';

// The entry the decision point reads for a destination, or null for a place with no entry. A blocked
// entry wins. Otherwise the most specific entry wins: an exact or raw key, then the longer domain,
// then the higher level, so a contact you marked at your own address leaves it yours.
export function findPlace(
  entries: readonly PlaceEntry[],
  destination: DestinationText,
): PlaceEntry | null {
  const covering = entries.filter((entry) => isPlaceCovered(entry.key, destination));
  const blocked = covering.filter((entry) => entry.trust === 'blocked');
  const candidates = blocked.length > 0 ? blocked : covering;

  return (
    candidates.toSorted(
      (left, right) =>
        rankKey(right.key) - rankKey(left.key) ||
        trustLevels.indexOf(right.trust) - trustLevels.indexOf(left.trust) ||
        compareIDs(left, right),
    )[0] ?? null
  );
}

const exactRank = 1_000_000;

function rankKey(key: PlaceKey): number {
  if (key.kind === 'site' || key.kind === 'mail_domain') {
    return key.subdomains ? key.domain.length : exactRank + key.domain.length;
  }

  return exactRank * 2;
}

function compareIDs(left: PlaceEntry, right: PlaceEntry): number {
  return left.placeID < right.placeID ? -1 : 1;
}
