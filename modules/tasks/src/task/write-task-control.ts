import { withWriteTransaction } from '@heynixie/log';
import { withRunEndSettled } from '../run/with-run-end-settled';
import { runEndedHook } from '../runner/run-ended-hook';
import type { TasksContext } from '../types';
import type { TaskControlOutcome, TaskControlRequest } from './write-task-control-in-transaction';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';

export async function writeTaskControl(
  context: Pick<
    TasksContext,
    'log' | 'clock' | 'definitions' | 'runSettings' | 'runners' | 'queueRunnerActions'
  >,
  request: TaskControlRequest,
): Promise<TaskControlOutcome> {
  const outcome = await withRunEndSettled(context, () =>
    withWriteTransaction(context.log.writer, (tx) =>
      writeTaskControlInTransaction(tx, context, request),
    ),
  );

  if (outcome.status === 'controlled') {
    await runControlEnded(context, request);
  }

  return outcome;
}

// A stop and a close end the task for its runner. Every other control leaves it be.
export async function runControlEnded(
  context: Pick<TasksContext, 'log' | 'clock' | 'definitions' | 'runners' | 'queueRunnerActions'>,
  request: TaskControlRequest,
): Promise<void> {
  if (request.control === 'stop') {
    await runEndedHook(context, request.taskID, 'stopped');
  }

  if (request.control === 'close') {
    await runEndedHook(context, request.taskID, 'closed');
  }
}
