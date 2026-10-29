import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext } from './types';
import type { TaskControlOutcome, TaskControlRequest } from './write-task-control-in-transaction';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';

export function writeTaskControl(
  context: Pick<TasksContext, 'log' | 'definitions'>,
  request: TaskControlRequest,
): Promise<TaskControlOutcome> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeTaskControlInTransaction(tx, context, request),
  );
}
