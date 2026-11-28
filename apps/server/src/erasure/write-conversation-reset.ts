import type { APIContext } from '@heynixie/api';
import type { ErasureFinishedFacts, LogTables, WriteTransaction } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';

// Writes the log_reset boundary in the transaction of erasure.finished, so the inbox moves and a
// backup falls due only once the keys are gone.
export async function writeConversationReset(
  tx: WriteTransaction,
  context: APIContext,
  finished: ErasureFinishedFacts,
): Promise<void> {
  const invalidated = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('last'))
    .where('kind', '=', 'model.session_invalidated')
    .where('thread', '=', conversationTaskID)
    .executeTakeFirst();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'log_reset',
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: {
        resetAt: context.clock.now(),
        lastSequence: invalidated?.last ?? 0,
        mode: 'conversations',
        shreddedRecords: finished.removedKeys,
      },
    },
  ]);
}
