import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log, WriteTransaction } from '@heynixie/log';
import type { PlaceKeyFault } from './check-place-key';
import { checkPlaceKey } from './check-place-key';
import type { PlaceContext } from './place-context';
import { placesChangedCodec } from './places-changed-codec';
import { readPlaces } from './read-places';
import type { Trust } from './types';

export interface PlaceChange {
  readonly placeID: string;
  readonly trust?: Trust;
  readonly name?: string | null;
}

export type PlaceChangeResult =
  | { readonly status: 'changed'; readonly trust: Trust }
  | { readonly status: 'not_found' }
  | { readonly status: 'refused'; readonly fault: PlaceKeyFault };

// Changes the level or the name of an entry that is still in the directory. A personal place
// repeats its whole name in the erasable fields, so the latest record holds it. The snapshot that
// holds the change goes in force in the same transaction.
export function writePlaceChanged(
  context: PlaceContext,
  change: PlaceChange,
): Promise<PlaceChangeResult> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writePlaceChangedInTransaction(tx, context, change),
  );
}

// Changes an entry inside the caller's write transaction, which an approval's answer holds.
export async function writePlaceChangedInTransaction(
  tx: WriteTransaction,
  context: PlaceContext,
  change: PlaceChange,
): Promise<PlaceChangeResult> {
  const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

  const [place] = await readPlaces(inTransaction, { placeIDs: [change.placeID] });

  if (place === undefined || place.isRemoved) {
    return { status: 'not_found' };
  }

  const trust = change.trust ?? place.trust;
  const fault = checkPlaceKey(place.key, trust, place.addedBy);

  if (fault !== null && fault !== 'raw_key') {
    return { status: 'refused', fault };
  }

  const name = change.name === undefined ? place.name : (change.name?.normalize('NFC') ?? null);

  // a raw key is a contact's own text, as personal as an address
  const isPersonal = place.key.kind !== 'site' && place.key.kind !== 'mail_domain';

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: placesChangedCodec.kind,
      definitions: context.definitions(),
      payload: placesChangedCodec.encode({
        placeID: place.placeID,
        ...(change.trust === undefined ? {} : { trust: change.trust }),
        ...(change.name === undefined || isPersonal ? {} : { name }),
      }),
      ...(isPersonal ? { erasable: { name } } : {}),
    },
  ]);

  await context.runInForce(tx);

  return { status: 'changed', trust };
}
