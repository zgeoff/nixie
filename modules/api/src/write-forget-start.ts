import type { RecordKind } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { recordForgetStartedCodec } from '@heynixie/memory';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { findRecordForget } from './find-record-forget';
import type { APIContext, APITables } from './types';

interface ForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

// Commits record.forget_started for a message or a reply on the thread and answers its time, or
// the first start's time when a forget of the record already began, or null when the thread holds
// no such record at the sequence.
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

  const begun = await findRecordForget(tx, {
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

// the records a forget can remove: your message, and a reply from the conversation's model
const forgettableKinds: readonly RecordKind[] = ['owner_message', 'model.reply'];
