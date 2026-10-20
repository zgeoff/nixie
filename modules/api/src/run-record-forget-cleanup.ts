import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { recordForgottenCodec, removeImageOfferKeys } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { readRecordForget } from './read-record-forget';
import type { APIContext, APITables } from './types';

// Finishes a forget that record.forget_started began: it deletes the record's key and each key of an
// image offer for it, runs the session cleanup and commits record.forgotten, each safe to rerun.
// Before the conversation starts the forget stays begun, and the start sequence finishes it.
export async function runRecordForgetCleanup(
  context: APIContext,
  recordSequence: number,
): Promise<void> {
  if (
    (await readRecordForget(context.log.writer.db, buildForgottenQuery(recordSequence))) !== null
  ) {
    return;
  }

  const thread = await removeForgottenKey(context, recordSequence);

  await removeImageOfferKeys(context.log, recordSequence);

  const cleanupSessions = context.readSessionCleanup();

  if (cleanupSessions === null) {
    return;
  }

  await cleanupSessions({ recordSequence });
  await writeRecordForgotten(context, { recordSequence, thread });
}

function buildForgottenQuery(sequence: number) {
  return { kind: 'record.forgotten', sequence } as const;
}

// Deletes and checkpoints the record's key, and answers the record's thread, which its forget's
// records go on.
async function removeForgottenKey(context: APIContext, recordSequence: number): Promise<string> {
  const target = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['thread', 'key_id'])
    .where('sequence', '=', recordSequence)
    .executeTakeFirst();

  // record.forget_started names a message or a reply that its transaction found on a thread
  invariant(
    target !== undefined && target.thread !== null,
    `the forgotten record ${String(recordSequence)} has no thread`,
  );

  if (target.key_id !== null) {
    await removeRecordKey(context.log, target.key_id);
  }

  return target.thread;
}

interface ForgottenTarget {
  readonly recordSequence: number;
  readonly thread: string;
}

// commits record.forgotten once, so a cleanup that runs twice leaves one
function writeRecordForgotten(context: APIContext, target: ForgottenTarget): Promise<void> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    if ((await readRecordForget(tx, buildForgottenQuery(target.recordSequence))) !== null) {
      return;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: recordForgottenCodec.kind,
        definitions: context.definitions(),
        thread: target.thread,
        payload: recordForgottenCodec.encode({ recordSequence: target.recordSequence }),
      },
    ]);
  });
}
