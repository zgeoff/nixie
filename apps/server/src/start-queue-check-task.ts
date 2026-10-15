import type { RunStep } from '@heynixie/tasks';
import { createSystemTask, writeInboxRecords } from '@heynixie/tasks';
import { makeQueueCheckStep } from './make-queue-check-step';
import { queueCheckTaskID } from './queue-check-task-id';
import { runWithRetry } from './run-with-retry';
import type { ServerParts } from './types';

// Puts the queue check into service as a system task and wakes it, so each start queues one action
// for the log-only connector. The step it returns runs the check's steps and passes the rest on.
export async function startQueueCheckTask(parts: ServerParts, runStep: RunStep): Promise<RunStep> {
  await runWithRetry(() => createQueueCheckWake(parts), {
    signal: parts.cleanup.signal,
    log: parts.log,
    step: 'queue_check',
  });

  const checkStep = makeQueueCheckStep({
    context: parts.context,
    queue: parts.tools.actions.queue,
    tool: parts.tools.actions.logConnector.tool,
  });

  return (input) => (input.taskID === queueCheckTaskID ? checkStep(input) : runStep(input));
}

async function createQueueCheckWake(parts: ServerParts): Promise<void> {
  await createSystemTask(parts.context, queueCheckTaskID);

  await writeInboxRecords(parts.context, [
    {
      kind: 'task.wake',
      definitions: parts.context.definitions(),
      thread: queueCheckTaskID,
      payload: { at: parts.context.clock.now() },
    },
  ]);
}
