import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readLimitRecords } from './read-limit-records';
import { taskLimitsRaisedCodec } from './task-limits-raised-codec';
import type { TaskLimits, TaskState, TasksContext, TasksTables } from './types';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';

export interface TaskLimitRaise {
  readonly taskID: string;
  readonly limits: {
    readonly turns?: number | undefined;
    readonly dollars?: number | undefined;
  };
}

export type TaskLimitRaiseOutcome =
  | {
      readonly status: 'raised';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
      readonly limits: TaskLimits;
    }
  | { readonly status: 'refused'; readonly reason: 'unknown_task' | 'not_held' | 'not_raised' };

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

    if (task === undefined) {
      return { status: 'refused', reason: 'unknown_task' };
    }

    const limitRecords = await readLimitRecords(tx, raise.taskID);

    const held = limitRecords.heldAt;

    if (held === null) {
      return { status: 'refused', reason: 'not_held' };
    }

    const limits = {
      turns: raise.limits.turns ?? held.turns,
      dollars: raise.limits.dollars ?? held.dollars,
    };

    if (limits.turns < held.turns || limits.dollars < held.dollars || isSameLimits(limits, held)) {
      return { status: 'refused', reason: 'not_raised' };
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.limits_raised',
        definitions: context.definitions(),
        thread: raise.taskID,
        payload: taskLimitsRaisedCodec.encode({ taskID: raise.taskID, limits }),
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
      limits,
    };
  });
}

function isSameLimits(left: TaskLimits, right: TaskLimits): boolean {
  return left.turns === right.turns && left.dollars === right.dollars;
}
