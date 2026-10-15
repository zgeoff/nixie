import { runPendingRecordForgets } from '@heynixie/api';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import type { RunStep } from '@heynixie/tasks';
import { runWithRetry } from './run-with-retry';
import { startConsolidatorTask } from './start-consolidator-task';
import type { ConversationImp } from './start-conversation-imp';
import { startMemory } from './start-memory';
import { startWork } from './start-work';
import { startWriterTask } from './start-writer-task';
import type { ServerParts } from './types';

// Starts the memory store, hands the session cleanup to the API and finishes each pending record
// forget, then starts the memory writer, the memory consolidator and the runners, so no turn runs
// before the store is there or on a session that holds a forgotten record's text.
export async function startMemoryAndWork(
  parts: ServerParts,
  conversation: ConversationImp,
): Promise<void> {
  const retry = { signal: parts.cleanup.signal, log: parts.log };

  const store = await runWithRetry(() => startMemory(parts, conversation.cleanupSessions), {
    ...retry,
    step: 'memory',
  });

  parts.tools.memory.set(store);

  // the slot fills before the pending forgets are read, so a forget that read it empty is pending
  parts.sessionCleanup.set(conversation.cleanupSessions);

  await runWithRetry(() => runPendingRecordForgets(parts.apiContext), {
    ...retry,
    step: 'record_forgets',
  });

  const writerStep = await runWithRetry(() => startWriterTask(parts, store), {
    ...retry,
    step: 'memory_writer',
  });

  const consolidatorStep = await runWithRetry(() => startConsolidatorTask(parts, store), {
    ...retry,
    step: 'memory_consolidator',
  });

  const systemSteps = new Map<string, RunStep>([
    [memoryWriterTaskID, writerStep],
    [memoryConsolidatorTaskID, consolidatorStep],
  ]);

  await startWork(parts, (input) => (systemSteps.get(input.taskID) ?? conversation.runStep)(input));
}
