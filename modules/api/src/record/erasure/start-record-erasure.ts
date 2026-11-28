import { readImportedImageKeyIDs } from '@heynixie/connectors';
import type { ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { readImageOfferKeyIDs, readPurgeSet, writeRecordPurgeSet } from '@heynixie/memory';
import { readForgetStarted } from '../../forget/read-forget-started';
import type { APIContext, APITables } from '../../types';
import { buildTransactionContext } from '../../utils/build-transaction-context';
import { readRecordForget } from '../../utils/read-record-forget';
import { readPlaceCascadeKeyIDs } from '../read-place-cascade-key-ids';
import { readRecordForgetCheck } from '../read-record-forget-check';
import { readRecordKeyIDs } from '../read-record-key-ids';
import { readRecordStartCalls } from '../read-record-start-calls';
import { readScreenPictureCallSequences } from '../read-screen-picture-call-sequences';
import type { RecordErasureRequest } from './build-record-erasable';

// The start transaction of a forget of one record. It captures every key that holds the record's
// text while the record still reads: its own, its place's, its brief's start calls, and the picture
// and offers that quote it.
export async function startRecordErasure(
  tx: WriteTransaction,
  context: APIContext,
  request: RecordErasureRequest,
): Promise<ErasureStart> {
  const inTransaction = buildTransactionContext(context, tx);
  const sequence = request.sequence;
  const isResuming = request.isResuming === true;

  const begun = await readRecordForget(tx, { kind: 'record.forget_started', sequence });

  if (begun !== null && !isResuming) {
    throw new ErasureRefusedError('already_begun');
  }

  if (!isResuming) {
    const check = await readRecordForgetCheck(tx, { thread: request.thread, sequence });

    if (check.status === 'action_not_finished') {
      throw new ErasureRefusedError('action_not_finished');
    }

    if (check.status !== 'ok') {
      throw new ErasureRefusedError('not_found');
    }
  }

  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['key_id', 'thread'])
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (row === undefined) {
    throw new ErasureRefusedError('not_found');
  }

  // A forget that an earlier release began kept what it found while the record was readable.
  const legacy = isResuming ? await readForgetStarted(inTransaction, sequence) : null;

  const startCalls =
    legacy === null
      ? await readRecordStartCalls(inTransaction, sequence)
      : (legacy.startCallSequences ?? []);

  const cascadeKeyIDs = await readPlaceCascadeKeyIDs(inTransaction.log, sequence);
  const pictureCalls = await readScreenPictureCallSequences(inTransaction, sequence);

  // A forget that an earlier release began has no purge set. It gets one before any key goes,
  // because the set reads the evidence of items that the purge then removes.
  await writeRecordPurgeSet(tx, context, sequence);

  const itemIDs = await readPurgeSet(tx, sequence, ['active', 'retired', 'forgetting']);

  const recordKeyIDs = row.key_id === null ? [] : [row.key_id];

  const startCallKeyIDs = await readRecordKeyIDs(tx, startCalls);
  const pictureKeyIDs = await readRecordKeyIDs(tx, pictureCalls);
  const offerKeyIDs = await readImageOfferKeyIDs(tx, sequence);
  const importedKeyIDs = await readImportedImageKeyIDs(tx, sequence);

  return {
    target: { kind: 'record', targetID: String(sequence), version: null },
    shortID: null,
    thread: row.thread,
    capture: {
      keys: {
        ids: [
          ...new Set([
            ...recordKeyIDs,
            ...cascadeKeyIDs,
            ...(legacy?.cascadeKeyIDs ?? []),
            ...startCallKeyIDs,
          ]),
        ],
      },
      cleanupKeys: [...new Set([...pictureKeyIDs, ...offerKeyIDs, ...importedKeyIDs])],
      sandboxCallIDs: [sequence, ...startCalls].map(String),
      purges: [{ recordSequence: sequence, itemIDs: [...itemIDs] }],
      sessionCause:
        startCalls.length === 0
          ? { recordSequence: sequence }
          : { recordSequence: sequence, callSequences: [...startCalls] },
      turnInputs: { threads: [], cleaned: true, floor: Math.min(sequence, ...startCalls) },
    },
  };
}
