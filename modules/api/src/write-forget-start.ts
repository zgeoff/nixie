import { writeRecordsInTransaction } from '@heynixie/log';
import { recordForgetStartedCodec } from '@heynixie/memory';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { probeForgettableRecord } from './probe-forgettable-record';
import { readRecordForget } from './read-record-forget';
import type { APIContext } from './types';

interface ForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

export async function writeForgetStart(
  tx: Transaction<unknown>,
  context: APIContext,
  input: ForgetTarget,
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

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: context.definitions(),
      thread: input.thread,
      payload: recordForgetStartedCodec.encode({ recordSequence: input.sequence }),
    },
  ]);

  invariant(record, 'the log wrote no record.forget_started record');

  return record.recordedAt.getTime();
}
