import { buildShortIDFromUUID } from '@heynixie/db';
import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { contactMarkedKnownCodec } from '../contact/contact-marked-known-codec';
import { contactUnmarkedCodec } from '../contact/contact-unmarked-codec';
import type { PolicyTables } from '../policy/policy-tables';
import { placesAddedCodec } from './places-added-codec';
import { placesChangedCodec } from './places-changed-codec';
import { placesRemovedCodec } from './places-removed-codec';

// The directory of places. It folds the records of its own and, as places at known, the records of
// the known contacts. A known contact's kind reads from its erasable destination, so its row holds
// the kind `contact` until the reader resolves it.
export const placesProjection: Projection = {
  table: 'places',
  keyColumn: 'place_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<PolicyTables>();

    if (record.kind === placesAddedCodec.kind) {
      return foldAdded(tx, record);
    }

    if (record.kind === placesChangedCodec.kind) {
      return foldChanged(tx, record);
    }

    if (record.kind === placesRemovedCodec.kind) {
      const removed = placesRemovedCodec.decode(record.payload);

      await db
        .updateTable('places')
        .set({ removed_sequence: record.sequence })
        .where('place_id', '=', removed.placeID)
        .where('removed_sequence', 'is', null)
        .execute();

      return [removed.placeID];
    }

    if (record.kind === contactMarkedKnownCodec.kind) {
      return foldContactMarked(tx, record);
    }

    if (record.kind === contactUnmarkedCodec.kind) {
      const unmarked = contactUnmarkedCodec.decode(record.payload);

      await db
        .updateTable('places')
        .set({ removed_sequence: record.sequence })
        .where('place_id', '=', unmarked.contactID)
        .where('origin', '=', 'contact')
        .where('removed_sequence', 'is', null)
        .execute();

      return [unmarked.contactID];
    }

    // tools declares the kind, and policy cannot import it
    const kind: string = record.kind;

    if (kind === 'tool_called') {
      return foldUsed(tx, record);
    }

    return [];
  },
};

async function foldAdded(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const db = tx.$extendTables<PolicyTables>();
  const added = placesAddedCodec.decode(record.payload);

  await db
    .insertInto('places')
    .values({
      place_id: added.placeID,
      short_id: added.shortID,
      origin: 'added',
      kind: added.kind,
      trust: added.trust,
      added_by: added.addedBy,
      name: added.name ?? null,
      domain: added.domain ?? null,
      subdomains: added.subdomains === undefined ? null : Number(added.subdomains),
      added_sequence: record.sequence,
      removed_sequence: null,
      name_sequence: null,
      last_used_at: null,
    })
    .execute();

  return [added.placeID];
}

async function foldChanged(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const db = tx.$extendTables<PolicyTables>();
  const changed = placesChangedCodec.decode(record.payload);

  await db
    .updateTable('places')
    .set({
      name_sequence: record.sequence,
      ...(changed.trust === undefined ? {} : { trust: changed.trust }),
      ...(changed.name === undefined ? {} : { name: changed.name }),
    })
    .where('place_id', '=', changed.placeID)
    .execute();

  return [changed.placeID];
}

async function foldContactMarked(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const db = tx.$extendTables<PolicyTables>();
  const marked = contactMarkedKnownCodec.decode(record.payload);

  await db
    .insertInto('places')
    .values({
      place_id: marked.contactID,
      short_id: buildShortIDFromUUID(marked.contactID),
      origin: 'contact',
      kind: 'contact',
      trust: 'known',
      added_by: 'you',
      name: null,
      domain: null,
      subdomains: null,
      added_sequence: record.sequence,
      removed_sequence: null,
      name_sequence: null,
      last_used_at: null,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  return [marked.contactID];
}

// The time a call last used a place: each tool_called whose decision carries the place.
async function foldUsed(
  tx: Transaction<unknown>,
  record: EnvelopeRecord,
): Promise<readonly string[]> {
  const db = tx.$extendTables<PolicyTables>();
  const decision = record.decision;

  const placeIDs = [
    ...new Set(
      (decision?.outcome === 'allow' ? (decision.permissions ?? []) : []).flatMap((permission) =>
        typeof permission === 'object' && permission !== null && permission.by === 'place'
          ? [permission.placeID]
          : [],
      ),
    ),
  ];

  if (placeIDs.length === 0) {
    return [];
  }

  await db
    .updateTable('places')
    .set({ last_used_at: record.recordedAt.getTime() })
    .where('place_id', 'in', placeIDs)
    .execute();

  return placeIDs;
}
