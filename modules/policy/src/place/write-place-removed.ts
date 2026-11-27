import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log } from '@heynixie/log';
import type { PlaceContext } from './place-context';
import { placesRemovedCodec } from './places-removed-codec';
import { readPlaces } from './read-places';

// false when no entry of the directory has the ID. The entry keeps its row, so a replay of an older
// call finds its key. The snapshot without the entry goes in force in the same transaction.
export function writePlaceRemoved(context: PlaceContext, placeID: string): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

    const [place] = await readPlaces(inTransaction, { placeIDs: [placeID] });

    if (place === undefined || place.isRemoved) {
      return false;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: placesRemovedCodec.kind,
        definitions: context.definitions(),
        payload: placesRemovedCodec.encode({ placeID }),
      },
    ]);

    await context.runInForce(tx);

    return true;
  });
}
