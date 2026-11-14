import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { recordForgottenCodec, removeImageOfferKeys } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import type { BriefStartCall } from './read-brief-start-calls';
import { readBriefStartCalls } from './read-brief-start-calls';
import { readRecordForget } from './read-record-forget';
import type { APIContext, APITables } from './types';

export async function runRecordForgetCleanup(
  context: APIContext,
  recordSequence: number,
): Promise<void> {
  if (
    (await readRecordForget(context.log.writer.db, buildForgottenQuery(recordSequence))) !== null
  ) {
    return;
  }

  const startCalls = await readBriefStartCalls(context, recordSequence);
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
  // starter both rebuild.
  for (const sequence of [recordSequence, ...startCalls.map((call) => call.sequence)]) {
    await cleanupSessions({ recordSequence: sequence });
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

async function removeCallKey(context: APIContext, call: BriefStartCall): Promise<void> {
  if (call.keyID !== null) {
    await removeRecordKey(context.log, call.keyID);
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
