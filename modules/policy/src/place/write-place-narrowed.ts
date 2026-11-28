import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log, WriteTransaction } from '@heynixie/log';
import type { PlaceContext } from './place-context';
import { placesNarrowedCodec } from './places-narrowed-codec';
import type { NarrowRefusal, NarrowRequest } from './plan-places-narrow';
import { planPlacesNarrow } from './plan-places-narrow';
import { readPlaces } from './read-places';
import type { Trust } from './types';
import { writePlaceChangedInTransaction } from './write-place-changed';
import { writePlaceRemovedInTransaction } from './write-place-removed';

export type PlaceNarrowResult =
  | { readonly status: 'lowered'; readonly shortID: string; readonly trust: Trust }
  | { readonly status: 'removed'; readonly shortID: string }
  | { readonly status: 'refused'; readonly reason: NarrowRefusal };

export interface NarrowCall {
  readonly callID: string;
  readonly thread: string;
}

// Lowers or removes the entry with the short ID, and writes the notice of the change on the call's
// thread. The directory is read, planned against and written in one write transaction, so two calls
// on one entry cannot both pass the plan.
export function writePlaceNarrowed(
  context: PlaceContext,
  shortID: string,
  request: NarrowRequest,
  call: NarrowCall,
): Promise<PlaceNarrowResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const inTransaction: Log = { ...context.log, writer: { ...context.log.writer, db: tx } };

    const everyPlace = await readPlaces(inTransaction);

    const stored = everyPlace.filter((place) => !place.isRemoved);
    const target = stored.find((place) => place.shortID === shortID);

    if (target === undefined) {
      return { status: 'refused', reason: 'not_found' };
    }

    const plan = planPlacesNarrow(stored, target.placeID, request);

    if (plan.status === 'refused') {
      return plan;
    }

    if (request.kind === 'remove') {
      await writePlaceRemovedInTransaction(tx, context, target.placeID);
      await writeNotice(tx, context, { shortID: target.shortID, call });

      return { status: 'removed', shortID: target.shortID };
    }

    const changed = await writePlaceChangedInTransaction(tx, context, {
      placeID: target.placeID,
      trust: request.trust,
    });

    if (changed.status !== 'changed') {
      return { status: 'refused', reason: 'not_found' };
    }

    await writeNotice(tx, context, { shortID: target.shortID, call, trust: changed.trust });

    return { status: 'lowered', shortID: target.shortID, trust: changed.trust };
  });
}

interface NarrowNotice {
  readonly shortID: string;
  readonly call: NarrowCall;
  readonly trust?: Trust;
}

async function writeNotice(
  tx: WriteTransaction,
  context: PlaceContext,
  notice: NarrowNotice,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: placesNarrowedCodec.kind,
      definitions: context.definitions(),
      thread: notice.call.thread,
      payload: placesNarrowedCodec.encode({
        shortID: notice.shortID,
        callID: notice.call.callID,
        ...(notice.trust === undefined ? {} : { trust: notice.trust }),
      }),
    },
  ]);
}
