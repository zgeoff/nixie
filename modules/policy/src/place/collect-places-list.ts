import { findPlace } from './find-place';
import { formatPlaceKey } from './format-place-key';
import { parsePlace } from './parse-place';
import type { StoredPlace } from './read-places';
import type { PlaceKey, Trust } from './types';

// Every filter is optional.
export interface PlacesListInput {
  readonly trust?: Trust | undefined;
  readonly kind?: PlaceKey['kind'] | undefined;

  // matches the key or the name, in any case
  readonly query?: string | undefined;

  // a host, address, number or handle; returns only the entry that covers it
  readonly place?: string | undefined;

  // adds addedBy and lastUsedAt to each row
  readonly detail?: boolean | undefined;

  // 50 when unset
  readonly limit?: number | undefined;

  // a short ID, for the next page
  readonly after?: string | undefined;
}

export interface ListedPlace {
  // the short ID
  readonly place: string;
  readonly key: string;
  readonly trust: Trust;
  readonly name: string | null;
  readonly addedBy?: string;
  readonly lastUsedAt?: string | null;
}

export type PlacesList =
  | {
      readonly status: 'ok';
      readonly total: number;
      readonly places: readonly ListedPlace[];

      // the short ID that asks for the next page; null on the last page
      readonly nextAfter: string | null;
    }
  | { readonly status: 'unknown_after' };

const defaultLimit = 50;

// The places that match every filter, in the order they were added, one page of them. `total`
// counts every match, whatever the limit and the page.
export function collectPlacesList(
  places: readonly StoredPlace[],
  input: PlacesListInput,
): PlacesList {
  const live = places.filter((place) => !place.isRemoved);

  const covering =
    input.place === undefined
      ? null
      : findPlace(live, { parsed: parsePlace(input.place), raw: input.place });

  const query = input.query?.toLowerCase();

  const matches = live
    .filter(
      (place) =>
        (input.trust === undefined || place.trust === input.trust) &&
        (input.kind === undefined || place.key.kind === input.kind) &&
        (covering === null ? input.place === undefined : place.placeID === covering.placeID) &&
        (query === undefined ||
          formatPlaceKey(place.key).toLowerCase().includes(query) ||
          (place.name?.toLowerCase().includes(query) ?? false)),
    )
    .toSorted((left, right) => left.addedSequence - right.addedSequence);

  const start = pickStart(matches, input.after);

  if (start === null) {
    return { status: 'unknown_after' };
  }

  const end = start + (input.limit ?? defaultLimit);
  const page = matches.slice(start, end);

  return {
    status: 'ok',
    total: matches.length,
    places: page.map((place) => toListedPlace(place, input.detail === true)),
    nextAfter: end < matches.length ? (page.at(-1)?.shortID ?? null) : null,
  };
}

function pickStart(matches: readonly StoredPlace[], after: string | undefined): number | null {
  if (after === undefined) {
    return 0;
  }

  const index = matches.findIndex((place) => place.shortID === after);

  return index === -1 ? null : index + 1;
}

function toListedPlace(place: StoredPlace, isDetailed: boolean): ListedPlace {
  return {
    place: place.shortID,
    key: formatPlaceKey(place.key),
    trust: place.trust,
    name: place.name,
    ...(isDetailed
      ? {
          addedBy: place.addedBy,
          lastUsedAt: place.lastUsedAt === null ? null : new Date(place.lastUsedAt).toISOString(),
        }
      : {}),
  };
}
