import type { DecisionPlace, StoredDestinationPermission } from '@heynixie/log';
import type { Effect } from '../types';
import { isReadingCall } from './is-reading-call';

export interface ActedDecision {
  readonly outcome: 'allow' | 'ask' | 'deny' | 'gate';
  readonly permissions: readonly (StoredDestinationPermission | null)[];
  readonly places?: readonly DecisionPlace[] | undefined;
}

// The places at act whose allow a call with an acting effect used: each is owed one places.acted
// record. A call with only reading effects, and a place at self, owe none.
export function collectActedPlaces(
  decision: ActedDecision,
  effects: readonly Effect[],
): readonly DecisionPlace[] {
  if (decision.outcome !== 'allow' || isReadingCall(effects)) {
    return [];
  }

  const actIDs = new Set(
    decision.permissions.flatMap((permission) =>
      typeof permission === 'object' &&
      permission !== null &&
      permission.by === 'place' &&
      permission.trust === 'act'
        ? [permission.placeID]
        : [],
    ),
  );

  return (decision.places ?? []).filter((place) => actIDs.has(place.placeID));
}
