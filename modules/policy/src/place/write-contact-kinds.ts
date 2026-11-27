import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { PolicyTables } from '../policy/policy-tables';
import { readPlaces } from './read-places';

const unsettledKind = 'contact';

// Sets each `contact` entry to the kind of its key. The fold cannot read the erasable destination,
// so a rebuild, a new marking and the server start run this. A forgotten entry keeps `contact`.
export async function writeContactKinds(log: Log): Promise<void> {
  const unsettled = await log.writer.db
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .select('place_id')
    .where('kind', '=', unsettledKind)
    .execute();

  if (unsettled.length === 0) {
    return;
  }

  const ids = new Set(unsettled.map((row) => row.place_id));

  const places = await readPlaces(log, { isRemovedIncluded: true });

  await withWriteTransaction(log.writer, async (tx) => {
    for (const place of places.filter((entry) => ids.has(entry.placeID))) {
      await tx
        .$extendTables<PolicyTables>()
        .updateTable('places')
        .set({ kind: place.key.kind })
        .where('place_id', '=', place.placeID)
        .where('kind', '=', unsettledKind)
        .execute();
    }
  });
}
