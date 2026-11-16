import type { JSONObject } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { TaskControlPlan } from '@heynixie/task-control';
import { planTaskControl } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { readLimitRecords } from '../limit/read-limit-records';
import { taskPauseRequestedCodec } from '../pause/task-pause-requested-codec';
import { toTransactionContext } from '../run/to-transaction-context';
import { writeRunEndInTransaction } from '../run/write-run-end-in-transaction';
import { pickResolvedControls } from '../runner/pick-resolved-controls';
import type {
  TaskControl,
  TaskControlRefusal,
  TaskRow,
  TaskState,
  TasksContext,
  TasksTables,
} from '../types';
import { taskInterruptedCodec } from './codec/task-interrupted-codec';
import { taskPausedCodec } from './codec/task-paused-codec';
import { taskRestartedCodec } from './codec/task-restarted-codec';
import { taskResumedCodec } from './codec/task-resumed-codec';
import { taskStoppedCodec } from './codec/task-stopped-codec';
import { writeTaskCloseInTransaction } from './write-task-close-in-transaction';

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
  context: Pick<TasksContext, 'log' | 'definitions' | 'runSettings' | 'runners'>,
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

  const limitRecords = await readLimitRecords(tx, task.task_id);
  const resolution = await context.runners.resolve(toTransactionContext(context, tx), task.task_id);

  const plan = planTaskControl(request.control, {
    state: task.state,
    isConversation: task.is_conversation === 1,
    isPauseRequested: task.pause_requested === 1,
    hasUnread: task.last_inbox_sequence > task.read_cursor,
    resumeState: task.resume_state,
    isLimitHeld: limitRecords.heldAt !== null,
    controls: pickResolvedControls(resolution),
  });

  if ('reason' in plan) {
    return { status: 'refused', refusal: plan };
  }

  if (plan.kind === 'task.closed') {
    const sequence = await writeTaskCloseInTransaction(tx, context, {
      taskID: task.task_id,
      stepKey: task.started_step_key,
      closedBy: 'owner',
      endedBy: 'control:close',
    });

    return readControlled(tx, task.task_id, sequence);
  }

  const timerIDs = plan.kind === 'task.stopped' ? await readPendingTimers(tx, task.task_id) : [];

  if (plan.kind === 'task.stopped') {
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

  if (plan.kind === 'task.stopped') {
    await writeRunEndInTransaction(tx, context, {
      taskID: task.task_id,
      trigger: { kind: 'stopped' },
      endedBy: 'control:stop',
      stepKey: null,
    });
  }

  return readControlled(tx, task.task_id, record.sequence);
}

async function readControlled(
  tx: Transaction<unknown>,
  taskID: string,
  sequence: number,
): Promise<TaskControlOutcome> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  return {
    status: 'controlled',
    state: row.state,
    isPauseRequested: row.pause_requested === 1,
    sequence,
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
    .with({ kind: 'task.closed' }, () => {
      throw new Error('the close writes its own record');
    })
    .with({ kind: 'task.interrupted' }, () =>
      taskInterruptedCodec.encode({ taskID, stepKey: requireStepKey(task) }),
    )
    .exhaustive();
}

function requireStepKey(task: TaskRow): string {
  invariant(task.started_step_key !== null, 'a running task has a started step');

  return task.started_step_key;
}
