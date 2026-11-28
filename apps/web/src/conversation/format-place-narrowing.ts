import type { PlaceNarrowingActivity } from './build-activity';

// "Lowered tickets.example.com to read" or "Removed tickets.example.com".
export function formatPlaceNarrowing(narrowing: PlaceNarrowingActivity): string {
  return narrowing.isRemoved || narrowing.trust === undefined
    ? `Removed ${narrowing.place}`
    : `Lowered ${narrowing.place} to ${narrowing.trust}`;
}
