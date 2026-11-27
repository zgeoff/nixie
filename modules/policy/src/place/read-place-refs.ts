import type { Kysely } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';
import type { Trust } from './types';
import { trustLevels } from './types';

// The place ID and the level of each entry in the directory now, by ID: the list that a definitions
// snapshot holds. It never holds a key.
export interface PlaceRef {
  readonly placeID: string;
  readonly trust: Trust;
}

export async function readPlaceRefs(db: Kysely<unknown>): Promise<readonly PlaceRef[]> {
  const rows = await db
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .select(['place_id', 'trust'])
    .where('removed_sequence', 'is', null)
    .orderBy('place_id')
    .execute();

  return rows.flatMap((row) => {
    const trust = trustLevels.find((level) => level === row.trust);

    return trust === undefined ? [] : [{ placeID: row.place_id, trust }];
  });
}
