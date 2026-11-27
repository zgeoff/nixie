import { formatPlaceKey } from './format-place-key';
import type { OwnPlaceSource } from './own-place-source';
import { parsePlacePattern } from './parse-place-pattern';
import type { PlaceContext } from './place-context';
import { readPlaces } from './read-places';
import { writePlaceAdded } from './write-place-added';

// Adds an entry at act, marked as nixie's own, for each place that a source names, unless nixie
// added that value before: a value you removed stays removed. Returns the count it added.
export async function writeOwnPlaces(
  context: PlaceContext,
  sources: readonly OwnPlaceSource[],
): Promise<number> {
  const lists = await Promise.all(sources.map((source) => source.read()));

  const named = lists.flat();

  if (named.length === 0) {
    return 0;
  }

  const earlier = await readPlaces(context.log, { isRemovedIncluded: true });

  const ownBefore = new Set(
    earlier
      .filter((place) => place.addedBy === 'nixie_own')
      .map((place) => `${place.key.kind}:${formatPlaceKey(place.key)}`),
  );

  let added = 0;

  for (const own of named) {
    const key = parsePlacePattern(own.place);

    if (key === null || ownBefore.has(`${key.kind}:${formatPlaceKey(key)}`)) {
      continue;
    }

    const result = await writePlaceAdded(context, {
      key,
      trust: 'act',
      name: own.name,
      addedBy: 'nixie_own',
    });

    added += result.status === 'added' ? 1 : 0;

    ownBefore.add(`${key.kind}:${formatPlaceKey(key)}`);
  }

  return added;
}
