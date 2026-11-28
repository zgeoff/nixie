import type { APIContext } from '@heynixie/api';
import { readCodeRunSequences } from '@heynixie/connectors';
import type { ErasureStart, LogTables, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError, readErasures } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';

// The start transaction of a reset of the conversations. It refuses a reset that is open, and
// captures the conversation's whole thread and each code sandbox that a call on it started.
export async function startConversationErasure(
  tx: WriteTransaction,
  context: APIContext,
): Promise<ErasureStart> {
  const log = { writer: { ...context.log.writer, db: tx } };

  const erasures = await readErasures(log, { kind: 'conversation', targetID: conversationTaskID });

  if (erasures.some((erasure) => !erasure.isFinished)) {
    throw new ErasureRefusedError('already_begun');
  }

  const calls = await readCodeRunSequences(tx, conversationTaskID);
  const floor = await readNextSequence(tx);

  return {
    target: { kind: 'conversation', targetID: conversationTaskID, version: null },
    shortID: null,
    capture: {
      keys: { thread: conversationTaskID },
      cleanupKeys: [],
      sandboxCallIDs: calls.map(String),
      purges: [],
      sessionCause: { sessions: 'none' },

      // The floor sits past the last record, so no other thread loses a request.
      turnInputs: { threads: [conversationTaskID], cleaned: false, floor },
    },
  };
}

// The sequence that the next record takes: past the last record of the log.
async function readNextSequence(tx: WriteTransaction): Promise<number> {
  const row = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('last'))
    .executeTakeFirst();

  return (row?.last ?? 0) + 1;
}
