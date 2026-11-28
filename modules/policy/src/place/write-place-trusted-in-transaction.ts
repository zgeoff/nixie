import type { Log, WriteTransaction } from '@heynixie/log';
import type { PlaceKeyFault } from './check-place-key';
import { formatPlaceKey } from './format-place-key';
import type { PlaceContext } from './place-context';
import { rankTrust } from './rank-trust';
import { readPlaces } from './read-places';
import type { PlaceAddedBy, PlaceKey } from './types';
import { writePlaceAddedInTransaction } from './write-place-added';
import { writePlaceChangedInTransaction } from './write-place-changed';

export interface PlaceTrust {
  readonly key: PlaceKey;
  readonly trust: 'read' | 'act';
  readonly addedBy: Extract<PlaceAddedBy, 'card' | 'proposal'>;

  // Whether a blocked entry may rise. A card never lifts a block: only an approval of nixie's
  // proposal does, and it takes the passkey check.
  readonly isUnblocking: boolean;
}

export type PlaceTrustResult =
  | { readonly status: 'added' | 'raised' }
  | { readonly status: 'unchanged' }
  | { readonly status: 'blocked' }
  | { readonly status: 'refused'; readonly fault: PlaceKeyFault | 'key_held' };

// Adds the entry for the exact key at the level, or raises the entry the key already has. It never
// lowers a level, and it reads the entry again inside the caller's transaction, because the card
// that offered the answer may be older than the directory.
export async function writePlaceTrustedInTransaction(
  tx: WriteTransaction,
  context: PlaceContext,
  request: PlaceTrust,
): Promise<PlaceTrustResult> {
  const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

  const held = await readPlaces(inTransaction);

  const keyText = formatPlaceKey(request.key);

  const exact = held.find(
    (place) =>
      !place.isRemoved &&
      place.key.kind === request.key.kind &&
      formatPlaceKey(place.key) === keyText,
  );

  if (exact === undefined) {
    const added = await writePlaceAddedInTransaction(tx, context, {
      key: request.key,
      trust: request.trust,
      name: null,
      addedBy: request.addedBy,
    });

    return added.status === 'added' ? { status: 'added' } : added;
  }

  if (exact.trust === 'blocked' && !request.isUnblocking) {
    return { status: 'blocked' };
  }

  if (rankTrust(exact.trust) >= rankTrust(request.trust) && exact.trust !== 'blocked') {
    return { status: 'unchanged' };
  }

  const changed = await writePlaceChangedInTransaction(tx, context, {
    placeID: exact.placeID,
    trust: request.trust,
  });

  if (changed.status === 'changed') {
    return { status: 'raised' };
  }

  return changed.status === 'refused' ? changed : { status: 'unchanged' };
}
