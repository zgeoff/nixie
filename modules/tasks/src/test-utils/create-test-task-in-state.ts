import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { claimTask } from '../claim-task';
import { createTask } from '../create-task';
import type { TaskClaim, TaskState, TasksContext } from '../types';
import { writeStepCommit } from '../write-step-commit';
import { writeStepError } from '../write-step-error';
import { writeTaskControl } from '../write-task-control';

export type TestTaskState = TaskState | 'pause_requested';

export interface TestTask {
  readonly taskID: string;

  readonly claim: TaskClaim | null;
}

export async function createTestTaskInState(
  context: TasksContext,
  state: TestTaskState,
): Promise<TestTask> {
  const taskID = await createTask(context, `reach the ${state} state`);

  return match(state)
    .with('ready', () => ({ taskID, claim: null }))
    .with('running', async () => ({ taskID, claim: await claimOne(context) }))
    .with('pause_requested', async () => {
      const claim = await claimOne(context);

      await writeTaskControl(context, { taskID, control: 'pause' });

      return { taskID, claim };
    })
    .with('waiting', 'done', async (next) => {
      const claim = await claimOne(context);

      await writeStepCommit(context, claim, {
        next: next === 'done' ? 'done' : 'wait',
        records: [],
        acknowledged: [],
      });

      return { taskID, claim: null };
    })
    .with('failed', async () => {
      const claim = await claimOne(context);

      await writeStepError(context, claim, {
        maxStepErrors: 1,
        retryDelayMs: 1000,
        maxRetryDelayMs: 1000,
        error: new Error('the step broke'),
      });

      return { taskID, claim: null };
    })
    .with('paused', 'stopped', 'closed', async (ended) => {
      await writeTaskControl(context, {
        taskID,
        control: match(ended)
          .with('paused', () => 'pause' as const)
          .with('stopped', () => 'stop' as const)
          .with('closed', () => 'close' as const)
          .exhaustive(),
      });

      return { taskID, claim: null };
    })
    .exhaustive();
}

async function claimOne(context: TasksContext): Promise<TaskClaim> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim, 'the new task is claimable');

  return claim;
}
