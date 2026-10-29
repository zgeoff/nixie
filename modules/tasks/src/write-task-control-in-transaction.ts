import type { JSONObject } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { TaskControlPlan } from '@heynixie/task-control';
import { planTaskControl } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { taskClosedCodec } from './task-closed-codec';
import { taskInterruptedCodec } from './task-interrupted-codec';
import { taskPauseRequestedCodec } from './task-pause-requested-codec';
import { taskPausedCodec } from './task-paused-codec';
import { taskRestartedCodec } from './task-restarted-codec';
import { taskResumedCodec } from './task-resumed-codec';
import { taskStoppedCodec } from './task-stopped-codec';
import type {
  TaskControl,
  TaskControlRefusal,
  TaskRow,
  TaskState,
  TasksContext,
  TasksTables,
} from './types';

export interface TaskControlRequest {
  readonly taskID: string;
  readonly control: TaskControl;
}

export type TaskControlOutcome =
  | {
      readonly status: 'controlled';
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
      readonly sequence: number;
    }
  | { readonly status: 'refused'; readonly refusal: TaskControlRefusal };

// The caller must hold the writer's write transaction, so the check of the task's state and the
// record that moves it commit together.
export async function writeTaskControlInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'definitions'>,
  request: TaskControlRequest,
): Promise<TaskControlOutcome> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .selectAll()
    .where('task_id', '=', request.taskID)
    .executeTakeFirst();

  if (task === undefined) {
    return { status: 'refused', refusal: { reason: 'unknown_task' } };
  }

  const plan = planTaskControl(request.control, {
    state: task.state,
    isConversation: task.is_conversation === 1,
    isPauseRequested: task.pause_requested === 1,
    hasUnread: task.last_inbox_sequence > task.read_cursor,
    resumeState: task.resume_state,
  });

  if ('reason' in plan) {
    return { status: 'refused', refusal: plan };
  }

  const isEnding = plan.kind === 'task.stopped' || plan.kind === 'task.closed';
  const timerIDs = isEnding ? await readPendingTimers(tx, task.task_id) : [];

  if (isEnding) {
    await removeTaskLease(tx, task.task_id);
  }

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: plan.kind,
      definitions: context.definitions(),
      thread: task.task_id,
      payload: buildControlPayload(plan, task, timerIDs),
    },
  ]);

  invariant(record, 'the control writes its record');

  const row = await db
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .where('task_id', '=', task.task_id)
    .executeTakeFirstOrThrow();

  return {
    status: 'controlled',
    state: row.state,
    isPauseRequested: row.pause_requested === 1,
    sequence: record.sequence,
  };
}

async function readPendingTimers(tx: Transaction<unknown>, taskID: string): Promise<string[]> {
  const rows = await tx
    .$extendTables<TasksTables>()
    .selectFrom('timers')
    .select('timer_id')
    .where('task_id', '=', taskID)
    .where('fired_at', 'is', null)
    .where('withdrawn_sequence', 'is', null)
    .orderBy('due_at')
    .execute();

  return rows.map((row) => row.timer_id);
}

// A step whose lease is gone commits nothing, so freeing the lease here keeps an aborted step's
// result out of the log even when the step ignores its abort.
async function removeTaskLease(tx: Transaction<unknown>, taskID: string): Promise<void> {
  await tx
    .$extendTables<TasksTables>()
    .updateTable('leases')
    .set({ holder: null, expires_at: null })
    .where('kind', '=', sql.lit('task'))
    .where('work_id', '=', taskID)
    .execute();
}

function buildControlPayload(
  plan: TaskControlPlan,
  task: TaskRow,
  timerIDs: readonly string[],
): JSONObject {
  const taskID = task.task_id;

  return match(plan)
    .with({ kind: 'task.pause_requested' }, () =>
      taskPauseRequestedCodec.encode({ taskID, stepKey: requireStepKey(task) }),
    )
    .with({ kind: 'task.paused' }, (paused) =>
      taskPausedCodec.encode({ taskID, resumeState: paused.resumeState }),
    )
    .with({ kind: 'task.resumed' }, (resumed) =>
      taskResumedCodec.encode({ taskID, nextState: resumed.nextState }),
    )
    .with({ kind: 'task.stopped' }, (stopped) =>
      taskStoppedCodec.encode({
        taskID,
        stepKey: task.started_step_key,
        timerIDs: [...timerIDs],
        resumeState: stopped.resumeState,
      }),
    )
    .with({ kind: 'task.restarted' }, (restarted) =>
      taskRestartedCodec.encode({ taskID, nextState: restarted.nextState }),
    )
    .with({ kind: 'task.closed' }, () =>
      taskClosedCodec.encode({ taskID, stepKey: task.started_step_key, timerIDs: [...timerIDs] }),
    )
    .with({ kind: 'task.interrupted' }, () =>
      taskInterruptedCodec.encode({ taskID, stepKey: requireStepKey(task) }),
    )
    .exhaustive();
}

function requireStepKey(task: TaskRow): string {
  invariant(task.started_step_key !== null, 'a running task has a started step');

  return task.started_step_key;
}
