import { withWriteTransaction } from '@heynixie/log';
import { runEndedHook } from '../runner/run-ended-hook';
import { readLeasedStepHop } from '../step/read-leased-step-hop';
import type { TasksContext, TasksTables } from '../types';
import { parseStepRunID } from '../utils/parse-step-run-id';
import type { TaskCloseRefusal } from './plan-task-close';
import { planTaskClose } from './plan-task-close';
import { writeTaskCloseInTransaction } from './write-task-close-in-transaction';

export interface TaskCloseRequest {
  readonly from: string;
  readonly taskID: string;
  readonly stepRunID: string | null;
}

export type TaskCloseOutcome =
  | { readonly status: 'closed'; readonly wasClosed: boolean }
  | { readonly status: 'refused'; readonly refusal: TaskCloseRefusal };

export async function writeTaskClose(
  context: Pick<
    TasksContext,
    'clock' | 'definitions' | 'log' | 'runSettings' | 'runners' | 'queueRunnerActions'
  >,
  request: TaskCloseRequest,
): Promise<TaskCloseOutcome> {
  const outcome = await writeTaskCloseTransaction(context, request);

  if (outcome.status === 'closed' && !outcome.wasClosed) {
    await runEndedHook(context, request.taskID, 'closed');
  }

  return outcome;
}

function writeTaskCloseTransaction(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runSettings' | 'runners'>,
  request: TaskCloseRequest,
): Promise<TaskCloseOutcome> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const step = request.stepRunID === null ? null : parseStepRunID(request.stepRunID);

    const hop =
      step === null ? null : await readLeasedStepHop(tx, request.from, step, context.clock.now());

    if (hop === null) {
      return { status: 'refused', refusal: { reason: 'stale_step' } };
    }

    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['is_conversation', 'started_by', 'state', 'started_step_key'])
      .where('task_id', '=', request.taskID)
      .executeTakeFirst();

    const facts =
      task === undefined
        ? null
        : {
            isCaller: request.taskID === request.from,
            isConversation: task.is_conversation === 1,
            isStarted: task.started_by !== null,
            state: task.state,
          };

    const plan = planTaskClose(facts);

    if (plan.status === 'refused') {
      return plan;
    }

    if (plan.status === 'already_closed') {
      return { status: 'closed', wasClosed: true };
    }

    await writeTaskCloseInTransaction(tx, context, {
      taskID: request.taskID,
      stepKey: task?.started_step_key ?? null,
      closedBy: 'nixie',
      endedBy: 'control:close',
      closer: request.from,
    });

    return { status: 'closed', wasClosed: false };
  });
}
