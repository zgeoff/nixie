import { z } from 'zod';
import { checkPlaceKey } from './check-place-key';
import { formatPlaceWords } from './format-place-words';
import { parsePlacePattern } from './parse-place-pattern';
import type { PlaceKey } from './types';

const proposedPlacesSchema = z.object({
  places: z
    .object({
      place: z.string(),
      trust: z.enum(['read', 'act']),
      why: z.string(),
    })
    .array(),
});

export interface ProposedPlace {
  readonly key: PlaceKey;
  readonly trust: 'read' | 'act';
  readonly why: string;

  // the key in words, as the card shows it
  readonly words: string;
}

export type ProposedPlaces =
  | { readonly status: 'ok'; readonly places: readonly ProposedPlace[] }
  | { readonly status: 'refused'; readonly message: string };

// Reads each proposed place through parsePlacePattern. A proposal with one place that is no place,
// that names a whole public suffix, or that no entry can hold at its level is refused whole.
export function parseProposedPlaces(input: unknown): ProposedPlaces {
  const parsed = proposedPlacesSchema.safeParse(input);

  if (!parsed.success) {
    return { status: 'refused', message: 'places must list each place with its trust and why' };
  }

  if (parsed.data.places.length === 0) {
    return { status: 'refused', message: 'propose at least one place' };
  }

  const places: ProposedPlace[] = [];

  for (const entry of parsed.data.places) {
    const key = parsePlacePattern(entry.place);

    if (key === null) {
      return {
        status: 'refused',
        message: `${entry.place} is no place, or its key covers a whole public suffix`,
      };
    }

    if (checkPlaceKey(key, entry.trust, 'proposal') !== null) {
      return {
        status: 'refused',
        message: `${entry.place} cannot be trusted to ${entry.trust}`,
      };
    }

    places.push({ key, trust: entry.trust, why: entry.why, words: formatPlaceWords(key) });
  }

  return { status: 'ok', places };
}
