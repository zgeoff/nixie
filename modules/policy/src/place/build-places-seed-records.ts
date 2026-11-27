import type { Definitions, RecordInput } from '@heynixie/log';
import { placesAddedCodec } from './places-added-codec';
import { placesRemovedCodec } from './places-removed-codec';
import type { PlacesSeedPlan } from './types';

// The records of a seed plan. The seed adds only sites and mail domains, whose IDs sit in the
// payload beside their keys.
export function buildPlacesSeedRecords(
  plan: PlacesSeedPlan,
  definitions: Definitions,
): readonly RecordInput[] {
  return [
    ...plan.removes.map((placeID): RecordInput => ({
      kind: 'places.removed',
      definitions,
      payload: placesRemovedCodec.encode({ placeID }),
    })),
    ...plan.adds.map((add): RecordInput => ({
      kind: 'places.added',
      definitions,
      payload: placesAddedCodec.encode({
        placeID: add.placeID,
        shortID: add.shortID,
        kind: add.key.kind,
        trust: add.trust,
        addedBy: 'seed',
        domain: add.key.domain,
        subdomains: add.key.subdomains,
        name: add.name,
      }),
    })),
  ];
}
