import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log, WriteTransaction } from '@heynixie/log';
import type { PlaceContext } from './place-context';
import { placesRemovedCodec } from './places-removed-codec';
import { readPlaces } from './read-places';
import { writeRemovedSequence } from './write-removed-sequence';

// false when no entry of the directory has the ID. The entry keeps its row, so a replay of an older
// call finds its key. The snapshot without the entry goes in force in the same transaction. The
// fold cannot read the ID of a personal place's removal, so the row takes it here.
export function writePlaceRemoved(context: PlaceContext, placeID: string): Promise<boolean> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writePlaceRemovedInTransaction(tx, context, placeID),
  );
}

// Removes an entry inside the caller's write transaction.
export async function writePlaceRemovedInTransaction(
  tx: WriteTransaction,
  context: PlaceContext,
  placeID: string,
): Promise<boolean> {
  const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

  const [place] = await readPlaces(inTransaction, { placeIDs: [placeID] });

  if (place === undefined || place.isRemoved) {
    return false;
  }

  const isOpen = place.key.kind === 'site' || place.key.kind === 'mail_domain';

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    isOpen
      ? {
          kind: placesRemovedCodec.kind,
          definitions: context.definitions(),
          payload: placesRemovedCodec.encode({ placeID }),
        }
      : {
          kind: placesRemovedCodec.kind,
          definitions: context.definitions(),
          payload: placesRemovedCodec.encode({}),
          erasable: { placeID },
        },
  ]);

  if (record !== undefined && !isOpen) {
    await writeRemovedSequence(tx, { placeID, sequence: record.sequence });
  }

  await context.runInForce(tx);

  return true;
}
