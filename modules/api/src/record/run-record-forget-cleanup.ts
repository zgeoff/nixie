import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { recordForgottenCodec, removeImageOfferKeys, writeRecordPurgeSet } from '@heynixie/memory';
import { waitAtFaultPoint } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readForgetStartCalls } from '../forget/read-forget-start-calls';
import type { APIContext, APITables } from '../types';
import { readRecordForget } from '../utils/read-record-forget';

export async function runRecordForgetCleanup(
  context: APIContext,
  recordSequence: number,
): Promise<void> {
  if (
    (await readRecordForget(context.log.writer.db, buildForgottenQuery(recordSequence))) !== null
  ) {
    return;
  }

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('record.forget.started', { kind: 'memory', id: String(recordSequence) });
  }

  // A forget that an earlier release began has no purge set. It gets one before any key goes,
  // because the set reads the evidence of items that the purge then removes.
  await withWriteTransaction(context.log.writer, (tx) =>
    writeRecordPurgeSet(tx, context, recordSequence),
  );

  const startCalls = await readForgetStartCalls(context, recordSequence);

  // A code sandbox holds unencrypted copies of what a code call read and wrote, so it goes before
  // any key does.
  await context.readCodeCleanup?.()?.([recordSequence, ...startCalls]);

  const thread = await removeForgottenKey(context, recordSequence);

  for (const call of startCalls) {
    await removeCallKey(context, call);
  }

  await removeImageOfferKeys(context.log, recordSequence);

  const cleanupSessions = context.readSessionCleanup();

  if (cleanupSessions === null) {
    return;
  }

  // Each destroyed record names its own cleanup, so the sessions of the started task and of the
  // starter both rebuild. The forgotten record goes last, because its cleanup also purges the memory
  // items that quote it, and every session must have rebuilt by then.
  for (const sequence of [...startCalls, recordSequence]) {
    await cleanupSessions({ recordSequence: sequence });
  }

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('record.forget.purged', { kind: 'memory', id: String(recordSequence) });
  }

  await writeRecordForgotten(context, { recordSequence, thread });
}

function buildForgottenQuery(sequence: number) {
  return { kind: 'record.forgotten', sequence } as const;
}

async function removeForgottenKey(context: APIContext, recordSequence: number): Promise<string> {
  const target = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['thread', 'key_id'])
    .where('sequence', '=', recordSequence)
    .executeTakeFirst();

  invariant(
    target !== undefined && target.thread !== null,
    `the forgotten record ${String(recordSequence)} has no thread`,
  );

  if (target.key_id !== null) {
    await removeRecordKey(context.log, target.key_id);
  }

  return target.thread;
}

async function removeCallKey(context: APIContext, callSequence: number): Promise<void> {
  const call = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', callSequence)
    .executeTakeFirst();

  if (call !== undefined && call.key_id !== null) {
    await removeRecordKey(context.log, call.key_id);
  }
}

interface ForgottenTarget {
  readonly recordSequence: number;
  readonly thread: string;
}

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
