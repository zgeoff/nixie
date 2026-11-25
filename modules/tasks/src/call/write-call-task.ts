import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import type { TasksContext } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import type { CallTaskOptions } from './call-task-options';
import { callRunnerKey } from './call-task-options';

// A call's turns hold no meter, so its envelope's limits only fill what a task run requires.
const callEnvelope = { report: 'none', limits: { turns: 1_000_000, dollars: 1_000_000 } } as const;

// Creates the task that holds a call's thread, in the caller's transaction, and returns its ID. The
// conversation starts the task, and it reports to no one: the calls module posts the summary.
export async function writeCallTask(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  options: CallTaskOptions,
): Promise<string> {
  const taskID = createShortID();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.created',
      definitions: context.definitions(),
      thread: taskID,
      payload: {
        ...taskCreatedCodec.encode({
          taskID,
          isConversation: false,
          state: 'ready',
          startedBy: conversationTaskID,
          runner: callRunnerKey,
          envelope: callEnvelope,
          disposable: false,
        }),
        runnerOptions: options,
      },
      erasable: { name: `Call ${options.callID}` },
    },
  ]);

  return taskID;
}
