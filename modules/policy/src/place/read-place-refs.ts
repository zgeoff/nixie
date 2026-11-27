import type { Kysely } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';
import type { Trust } from './types';
import { trustLevels } from './types';

// The place ID and the level of each entry in the directory now, by ID: the list that a definitions
// snapshot holds. It never holds a key. nameSequence names the change record the entry's name came
// from, when a change set it.
export interface PlaceRef {
  readonly placeID: string;
  readonly trust: Trust;
  readonly nameSequence?: number;
}

export async function readPlaceRefs(db: Kysely<unknown>): Promise<readonly PlaceRef[]> {
  const rows = await db
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .leftJoin('place_removals', 'place_removals.place_id', 'places.place_id')
    .select(['places.place_id', 'places.trust', 'places.name_sequence'])
    .where('places.removed_sequence', 'is', null)
    .where('place_removals.removed_sequence', 'is', null)
    .orderBy('places.place_id')
    .execute();

  return rows.flatMap((row) => {
    const trust = trustLevels.find((level) => level === row.trust);

    return trust === undefined
      ? []
      : [
          {
            placeID: row.place_id,
            trust,
            ...(row.name_sequence === null ? {} : { nameSequence: row.name_sequence }),
          },
        ];
  });
}
