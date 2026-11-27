import type { Transaction } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';

export interface PlaceRemoval {
  readonly placeID: string;
  readonly sequence: number;
}

// Marks an entry removed by its first removal record. Returns false when the entry was removed
// already or has no row.
export async function writeRemovedSequence(
  tx: Transaction<unknown>,
  removal: PlaceRemoval,
): Promise<boolean> {
  const result = await tx
    .$extendTables<PolicyTables>()
    .updateTable('places')
    .set({ removed_sequence: removal.sequence })
    .where('place_id', '=', removal.placeID)
    .where('removed_sequence', 'is', null)
    .executeTakeFirst();

  return result.numUpdatedRows > 0n;
}
