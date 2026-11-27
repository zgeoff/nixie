import type { OwnPlaceSource } from '@heynixie/policy';

// The places that each feature that is on names as nixie's own. Core owns this list and names no
// feature: a feature adds its source here when the composition root starts it.
export function listOwnPlaceSources(): readonly OwnPlaceSource[] {
  return [];
}
