import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { requireLease } from '@heynixie/tasks';
import type { ConversationRun } from '../types';
import type { ReplyVoids } from '../utils/build-reply-voids';
import { buildReplyVoids } from '../utils/build-reply-voids';

// Voids the replies of the attempts that do not keep them, in one transaction behind the lease. A
// runner that lost its lease writes nothing: the next step's sweep voids what it left.
export async function writeReplyVoids(
  run: Pick<ConversationRun, 'context'>,
  input: Pick<StepInput, 'lease' | 'taskID'>,
  voids: readonly ReplyVoids[],
): Promise<void> {
  const records = voids.flatMap((group) => buildReplyVoids(run.context, group, input.taskID));

  if (records.length === 0) {
    return;
  }

  const context = run.context;

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, input.lease, context.clock.now());
    await writeRecordsInTransaction(tx, context.log, records);
  });
}
