import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log, WriteTransaction } from '@heynixie/log';
import type { PlaceKeyFault } from './check-place-key';
import { checkPlaceKey } from './check-place-key';
import { formatPlaceKey } from './format-place-key';
import type { PlaceContext } from './place-context';
import { placesAddedCodec } from './places-added-codec';
import { readPlaces } from './read-places';
import type { PlaceAddedBy, PlaceKey, Trust } from './types';

export interface PlaceAdd {
  readonly key: PlaceKey;
  readonly trust: Trust;
  readonly name: string | null;
  readonly addedBy: PlaceAddedBy;
}

export type PlaceAddResult =
  | {
      readonly status: 'added';
      readonly placeID: string;
      readonly shortID: string;
      readonly trust: Trust;
    }
  | { readonly status: 'refused'; readonly fault: PlaceKeyFault | 'key_held' };

// Adds an entry, and checks the one entry per key inside the write transaction against the keys read
// back from the records. The first of a place's records takes no thread. The snapshot that holds the
// entry goes in force in the same transaction.
export function writePlaceAdded(context: PlaceContext, add: PlaceAdd): Promise<PlaceAddResult> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writePlaceAddedInTransaction(tx, context, add),
  );
}

// Adds an entry inside the caller's write transaction, which an approval's answer holds.
export async function writePlaceAddedInTransaction(
  tx: WriteTransaction,
  context: PlaceContext,
  add: PlaceAdd,
): Promise<PlaceAddResult> {
  const fault = checkPlaceKey(add.key, add.trust, add.addedBy);

  if (fault !== null) {
    return { status: 'refused', fault };
  }

  const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

  const held = await readPlaces(inTransaction);

  const keyText = formatPlaceKey(add.key);

  if (
    held.some((place) => place.key.kind === add.key.kind && formatPlaceKey(place.key) === keyText)
  ) {
    return { status: 'refused', fault: 'key_held' };
  }

  const placeID = crypto.randomUUID();
  const shortID = createShortID();
  const name = add.name?.normalize('NFC') ?? null;

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: placesAddedCodec.kind,
      definitions: context.definitions(),
      payload: placesAddedCodec.encode(buildPayload(add, { placeID, shortID, name })),
      ...buildErasable(add.key, name),
    },
  ]);

  await context.runInForce(tx);

  return { status: 'added', placeID, shortID, trust: add.trust };
}

interface AddedIDs {
  readonly placeID: string;
  readonly shortID: string;
  readonly name: string | null;
}

function buildPayload(add: PlaceAdd, ids: AddedIDs) {
  const base = { ...ids, trust: add.trust, addedBy: add.addedBy };

  if (add.key.kind === 'site' || add.key.kind === 'mail_domain') {
    return {
      ...base,
      kind: add.key.kind,
      domain: add.key.domain,
      subdomains: add.key.subdomains,
    };
  }

  // the key and the name of a personal place stay out of the payload
  return {
    placeID: ids.placeID,
    shortID: ids.shortID,
    trust: add.trust,
    addedBy: add.addedBy,
    kind: toPersonalKind(add.key),
  };
}

function toPersonalKind(key: PlaceKey): 'address' | 'phone' | 'handle' {
  if (key.kind === 'phone' || key.kind === 'handle') {
    return key.kind;
  }

  return 'address';
}

function buildErasable(key: PlaceKey, name: string | null) {
  return key.kind === 'address' || key.kind === 'phone' || key.kind === 'handle'
    ? { erasable: { key, name } }
    : {};
}
