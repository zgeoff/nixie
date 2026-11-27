import type { PlaceRef } from './read-place-refs';
import type { PlacesSeedPlan } from './types';

// The entries of the directory after the plan, by ID and level.
export function applyPlacesSeedPlan(
  refs: readonly PlaceRef[],
  plan: PlacesSeedPlan,
): readonly PlaceRef[] {
  const removed = new Set(plan.removes);

  return [
    ...refs.filter((ref) => !removed.has(ref.placeID)),
    ...plan.adds.map((add) => ({ placeID: add.placeID, trust: add.trust })),
  ];
}
