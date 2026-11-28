import { readRecordImageUUIDs } from '@heynixie/connectors';
import type { Erasable } from '@heynixie/log';
import type { APIContext } from '../../types';
import { buildTransactionContext } from '../../utils/build-transaction-context';
import { readPlaceKeyIDs } from '../read-place-key-ids';
import { readLegacyOpenRecordForgets } from './read-legacy-open-record-forgets';
import { startRecordErasure } from './start-record-erasure';

export interface RecordErasureRequest {
  readonly sequence: number;

  // the thread that the caller names; null for a child, whose caller names none
  readonly thread: string | null;

  // starts from a forget that an earlier release began and never ended
  readonly isResuming?: boolean;
}

// The record's runner methods. A forget captures the key of the record, of its place's records, of
// the start calls that hold its brief, and of what a screen click or an image offer shows. Its
// children are the images whose bytes it holds.
export function buildRecordErasable(context: APIContext): Erasable<RecordErasureRequest> {
  return {
    start: (tx, request) => startRecordErasure(tx, context, request),
    hide: () => Promise.resolve(),
    readChildren: async (tx, target) => {
      const images = await readRecordImageUUIDs(tx, Number(target.targetID));

      return images.map((image) => ({ kind: 'image', targetID: image, version: null }));
    },
    readLateKeyIDs: (tx, _target, capture) =>
      capture.placeID === undefined
        ? Promise.resolve([])
        : readPlaceKeyIDs(buildTransactionContext(context, tx).log, capture.placeID),
    toRequest: (target) => ({ sequence: Number(target.targetID), thread: null }),
    cleanIndexes: () => Promise.resolve(),
    readLegacyOpen: () => readLegacyOpenRecordForgets(context),
  };
}
