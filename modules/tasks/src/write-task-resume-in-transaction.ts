import { exemptTaskInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { probeTaskPaused } from './probe-task-paused';
import type { TasksContext, TasksTables } from './types';
import type { TaskControlOutcome } from './write-task-control-in-transaction';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';

export interface TaskResumeRequest {
  readonly taskID: string;
  readonly by: string;
}

// The caller must hold the writer's write transaction. While nixie is paused, the resume of a task
// lets that task run alone: it resumes a task paused on its own, and exempts the task from nixie's
// pause, in one transaction.
export async function writeTaskResumeInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'definitions'>,
  request: TaskResumeRequest,
): Promise<TaskControlOutcome> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .where('task_id', '=', request.taskID)
    .executeTakeFirst();

  const control = { taskID: request.taskID, control: 'resume' } as const;

  if (task === undefined) {
    return writeTaskControlInTransaction(tx, context, control);
  }

  const isPausedByNixie = await probeTaskPaused(tx, request.taskID);

  if (!isPausedByNixie) {
    return writeTaskControlInTransaction(tx, context, control);
  }

  const isPausedOnItsOwn =
    task.state === 'paused' || (task.state === 'running' && task.pause_requested === 1);

  const exemption = {
    taskID: request.taskID,
    by: request.by,
    definitions: context.definitions(),
  };

  if (isPausedOnItsOwn) {
    const outcome = await writeTaskControlInTransaction(tx, context, control);

    if (outcome.status === 'controlled') {
      await exemptTaskInTransaction(tx, context.log, exemption);
    }

    return outcome;
  }

  await exemptTaskInTransaction(tx, context.log, exemption);

  const exempt = await db
    .selectFrom('pause_exemptions')
    .select('exempt_sequence')
    .where('task_id', '=', request.taskID)
    .executeTakeFirstOrThrow();

  return {
    status: 'controlled',
    state: task.state,
    isPauseRequested: task.pause_requested === 1,
    sequence: exempt.exempt_sequence,
  };
}
