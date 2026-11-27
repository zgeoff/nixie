import { writeRecordsInTransaction } from '@heynixie/log';
import { recordForgetStartedCodec, writeRecordPurgeSet } from '@heynixie/memory';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { readPlaceCascadeKeyIDs } from '../record/read-place-cascade-key-ids';
import type { APIContext } from '../types';
import { probeForgettableRecord } from '../utils/probe-forgettable-record';
import { readRecordForget } from '../utils/read-record-forget';

export interface ForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

export async function writeForgetStart(
  tx: Transaction<unknown>,
  context: APIContext,
  input: ForgetTarget,
  startCallSequences: readonly number[],
): Promise<number | null> {
  if (!(await probeForgettableRecord(tx, input))) {
    return null;
  }

  const begun = await readRecordForget(tx, {
    kind: recordForgetStartedCodec.kind,
    sequence: input.sequence,
  });

  if (begun !== null) {
    return begun.recordedAt;
  }

  const cascadeKeyIDs = await readPlaceCascadeKeyIDs(
    { ...context.log, writer: { ...context.log.writer, db: tx } },
    input.sequence,
  );

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: context.definitions(),
      thread: input.thread,
      payload: recordForgetStartedCodec.encode({
        recordSequence: input.sequence,
        ...(startCallSequences.length === 0 ? {} : { startCallSequences: [...startCallSequences] }),
        ...(cascadeKeyIDs.length === 0 ? {} : { cascadeKeyIDs: [...cascadeKeyIDs] }),
      }),
    },
  ]);

  invariant(record, 'the log wrote no record.forget_started record');

  await writeRecordPurgeSet(tx, context, input.sequence);

  return record.recordedAt.getTime();
}
