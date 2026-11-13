import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { readStartedTaskIDs, readTaskSetup } from '@heynixie/tasks';
import { pickCleanedTaskIDs } from './pick-cleaned-task-ids';
import type { SessionCleanupCause } from './types';

export async function readCleanedTaskIDs(
  context: TasksContext,
  cause: SessionCleanupCause,
): Promise<readonly string[]> {
  const open = await readStartedTaskIDs(context, { end: 'open' });

  const candidates = await Promise.all(
    open.map(async (taskID) => ({ taskID, setup: await readTaskSetup(context, taskID) })),
  );

  const recordThread = await readForgottenRecordThread(context, cause);

  return pickCleanedTaskIDs(candidates, recordThread);
}

// The forget deletes the record's key and keeps its row, so a rerun at start reads the same thread.
async function readForgottenRecordThread(
  context: TasksContext,
  cause: SessionCleanupCause,
): Promise<string | null> {
  if (!('recordSequence' in cause)) {
    return null;
  }

  const [entry] = await readRecords(context.log, {
    afterSequence: cause.recordSequence - 1,
    sequences: [cause.recordSequence],
    limit: 1,
  });

  return entry?.record.thread ?? null;
}
