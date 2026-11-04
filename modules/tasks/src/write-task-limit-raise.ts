import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { AskedLimits, TaskLimitRaiseRefusal } from './plan-task-limit-raise';
import { planTaskLimitRaise } from './plan-task-limit-raise';
import { readLimitRecords } from './read-limit-records';
import { taskLimitsRaisedCodec } from './task-limits-raised-codec';
import type { TaskLimits, TaskState, TasksContext, TasksTables } from './types';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';

export interface TaskLimitRaise {
  readonly taskID: string;
  readonly limits: AskedLimits;
}

export type TaskLimitRaiseOutcome =
  | {
      readonly status: 'raised';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
      readonly limits: TaskLimits;
    }
  | { readonly status: 'refused'; readonly reason: TaskLimitRaiseRefusal };

export function writeTaskLimitRaise(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  raise: TaskLimitRaise,
): Promise<TaskLimitRaiseOutcome> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('task_id')
      .where('task_id', '=', raise.taskID)
      .executeTakeFirst();

    const limitRecords = await readLimitRecords(tx, raise.taskID);

    const plan = planTaskLimitRaise(
      { isKnown: task !== undefined, heldAt: limitRecords.heldAt },
      raise.limits,
    );

    if (plan.status === 'refused') {
      return plan;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.limits_raised',
        definitions: context.definitions(),
        thread: raise.taskID,
        payload: taskLimitsRaisedCodec.encode({ taskID: raise.taskID, limits: plan.limits }),
      },
    ]);

    // A raise of a task that the user stopped meanwhile leaves it stopped, for a restart to resume.
    await writeTaskControlInTransaction(tx, context, {
      taskID: raise.taskID,
      control: 'resume',
    });

    const row = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['state', 'pause_requested'])
      .where('task_id', '=', raise.taskID)
      .executeTakeFirstOrThrow();

    return {
      status: 'raised',
      state: row.state,
      isPauseRequested: row.pause_requested === 1,
      limits: plan.limits,
    };
  });
}
