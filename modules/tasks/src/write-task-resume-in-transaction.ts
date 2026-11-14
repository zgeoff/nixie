import { exemptTaskInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { pickTaskResumeAction } from './pick-task-resume-action';
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

  const isPausedByNixie = await probeTaskPaused(tx, request.taskID);

  const action = pickTaskResumeAction({
    task:
      task === undefined
        ? null
        : { state: task.state, isPauseRequested: task.pause_requested === 1 },
    isPausedByNixie,
  });

  const exemption = {
    taskID: request.taskID,
    by: request.by,
    definitions: context.definitions(),
  };

  return match(action)
    .with('control', () => writeTaskControlInTransaction(tx, context, control))
    .with('control_then_exempt', async () => {
      const outcome = await writeTaskControlInTransaction(tx, context, control);

      if (outcome.status === 'controlled') {
        await exemptTaskInTransaction(tx, context.log, exemption);
      }

      return outcome;
    })
    .with('exempt', async () => {
      await exemptTaskInTransaction(tx, context.log, exemption);

      const exempt = await db
        .selectFrom('pause_exemptions')
        .select('exempt_sequence')
        .where('task_id', '=', request.taskID)
        .executeTakeFirstOrThrow();

      invariant(task !== undefined, 'an exempted task exists');

      return {
        status: 'controlled' as const,
        state: task.state,
        isPauseRequested: task.pause_requested === 1,
        sequence: exempt.exempt_sequence,
      };
    })
    .exhaustive();
}
