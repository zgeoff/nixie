import { withWriteTransaction } from '@heynixie/log';
import { readLimitRecords } from '../../limit/read-limit-records';
import type { TaskLimits, TaskState, TasksContext, TasksTables } from '../../types';
import { writeTaskControlInTransaction } from '../write-task-control-in-transaction';
import type { AskedLimits, TaskLimitRaiseRefusal } from './plan-task-limit-raise';
import { planTaskLimitRaise } from './plan-task-limit-raise';
import { readRaisedSandboxLimit } from './read-raised-sandbox-limit';
import type { RaisedSandboxLimit } from './types';
import { writeTaskLimitHoldInTransaction } from './write-task-limit-hold-in-transaction';

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

      // the sandbox that the gateway counts for the task and what its limit must hold after the
      // raise, or null when no task run of the task is counted by the gateway
      readonly sandboxLimit: RaisedSandboxLimit | null;
    }
  | { readonly status: 'refused'; readonly reason: TaskLimitRaiseRefusal };

// The raise commits first. The caller sets the sandbox's limit after the commit, because a limit set
// before it would let the sandbox spend past a raise that failed.
export async function writeTaskLimitRaise(
  context: Pick<TasksContext, 'definitions' | 'log' | 'runSettings' | 'runners'>,
  raise: TaskLimitRaise,
): Promise<TaskLimitRaiseOutcome> {
  const outcome = await writeRaise(context, raise);

  if (outcome.status === 'refused') {
    return outcome;
  }

  return { ...outcome, sandboxLimit: await readRaisedSandboxLimit(context, raise.taskID) };
}

type RaisedOutcome =
  | Omit<Extract<TaskLimitRaiseOutcome, { status: 'raised' }>, 'sandboxLimit'>
  | Extract<TaskLimitRaiseOutcome, { status: 'refused' }>;

function writeRaise(
  context: Pick<TasksContext, 'definitions' | 'log' | 'runSettings' | 'runners'>,
  raise: TaskLimitRaise,
): Promise<RaisedOutcome> {
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

    await writeTaskLimitHoldInTransaction(tx, context, raise.taskID, {
      kind: 'raise',
      limits: plan.limits,
    });

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
