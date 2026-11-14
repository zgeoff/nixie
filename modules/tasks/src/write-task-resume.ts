import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext } from './types';
import type { TaskControlOutcome } from './write-task-control-in-transaction';
import type { TaskResumeRequest } from './write-task-resume-in-transaction';
import { writeTaskResumeInTransaction } from './write-task-resume-in-transaction';

export function writeTaskResume(
  context: Pick<TasksContext, 'log' | 'definitions'>,
  request: TaskResumeRequest,
): Promise<TaskControlOutcome> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeTaskResumeInTransaction(tx, context, request),
  );
}
