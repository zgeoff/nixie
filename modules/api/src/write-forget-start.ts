import type { RecordKind } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { recordForgetStartedCodec } from '@heynixie/memory';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { readRecordForget } from './read-record-forget';
import type { APIContext, APITables } from './types';

interface ForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

const forgettableKinds: readonly RecordKind[] = ['owner_message', 'model.reply'];

export async function writeForgetStart(
  tx: Transaction<unknown>,
  context: APIContext,
  input: ForgetTarget,
): Promise<number | null> {
  const target = await tx
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('sequence', '=', input.sequence)
    .where('thread', '=', input.thread)
    .where('kind', 'in', forgettableKinds)
    .executeTakeFirst();

  if (target === undefined) {
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
