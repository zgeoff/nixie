import type { Transaction } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';

export interface PlaceRemoval {
  readonly placeID: string;
  readonly sequence: number;
}

// Marks an address, phone or handle entry removed by its first removal record, in place_removals:
// the fold cannot read the place ID, which the record holds in its erasable fields.
export async function writeRemovedSequence(
  tx: Transaction<unknown>,
  removal: PlaceRemoval,
): Promise<void> {
  await tx
    .$extendTables<PolicyTables>()
    .insertInto('place_removals')
    .values({ place_id: removal.placeID, removed_sequence: removal.sequence })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
