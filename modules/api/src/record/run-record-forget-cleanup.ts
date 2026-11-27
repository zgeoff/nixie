import { removeImportedImageKeys } from '@heynixie/connectors';
import {
  parseJSONObject,
  removeRecordKey,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { recordForgottenCodec, removeImageOfferKeys, writeRecordPurgeSet } from '@heynixie/memory';
import { actionProposedCodec } from '@heynixie/policy';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { readForgetStartCalls } from '../forget/read-forget-start-calls';
import { screenClickToolName } from '../proposal/read-screen-picture';
import type { APIContext, APITables } from '../types';
import { readRecordForget } from '../utils/read-record-forget';
import { removePlaceKeys } from './remove-place-keys';

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

  await removePlaceKeys(context, recordSequence);

  for (const call of [...startCalls, ...(await readScreenPictureCalls(context, recordSequence))]) {
    await removeCallKey(context, call);
  }

  await removeImageOfferKeys(context.log, recordSequence);
  await removeImportedImageKeys(context.log, recordSequence);

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

// The thread of the record, or null for a record of a place, which belongs to no conversation.
async function removeForgottenKey(
  context: APIContext,
  recordSequence: number,
): Promise<string | null> {
  const target = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['thread', 'key_id'])
    .where('sequence', '=', recordSequence)
    .executeTakeFirst();

  invariant(
    target !== undefined,
    `the forgotten record ${String(recordSequence)} is not in the log`,
  );

  if (target.key_id !== null) {
    await removeRecordKey(context.log, target.key_id);
  }

  return target.thread;
}

// The proposal of a screen click shows a picture that sits under the click's own call record, so
// forgetting the proposal removes that call's key too, and the card can no longer read the picture.
async function readScreenPictureCalls(
  context: APIContext,
  recordSequence: number,
): Promise<readonly number[]> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', recordSequence)
    .where('kind', '=', actionProposedCodec.kind)
    .where(sql`json_extract(payload, '$.tool')`, '=', screenClickToolName)
    .executeTakeFirst();

  if (row === undefined) {
    return [];
  }

  return [actionProposedCodec.decode(parseJSONObject(row.payload)).callSequence];
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
  readonly thread: string | null;
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
        ...(target.thread === null ? {} : { thread: target.thread }),
        payload: recordForgottenCodec.encode({ recordSequence: target.recordSequence }),
      },
    ]);
  });
}
