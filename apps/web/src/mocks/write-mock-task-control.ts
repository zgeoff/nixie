import type { TaskControl } from '@heynixie/task-control';
import { buildControlledFields, planTaskControl } from '@heynixie/task-control';
import { match } from 'ts-pattern';
import { pauseStore } from './pause-store';
import { probeMockTaskPaused } from './probe-mock-task-paused';
import { store } from './store';

export type MockTaskControl = TaskControl;

type MockTask = NonNullable<ReturnType<typeof store.tasks.findFirst>>;

type MockTaskState = MockTask['state'];

interface TaskControlInput {
  readonly clientActionID: string;
  readonly taskID: string;
}

interface ControlledTask {
  readonly controlledAt: Date;
  readonly isPauseRequested: boolean;
  readonly state: MockTaskState;
  readonly taskID: string;
}

type TaskControlResult =
  | ({ readonly status: 'controlled' } & ControlledTask)
  | { readonly status: 'task_not_found' }
  | { readonly status: 'conversation_never_closes' }
  | { readonly status: 'definition_task_never_closes' }
  | { readonly status: 'runner_lacks_control' }
  | {
      readonly status: 'state_refused';
      readonly state: MockTaskState;
      readonly isPauseRequested: boolean;
    }
  | { readonly status: 'reused' };

export async function writeMockTaskControl(
  control: MockTaskControl,
  input: TaskControlInput,
): Promise<TaskControlResult> {
  const earlier = store.taskControlActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.control === control && earlier.taskID === input.taskID
      ? {
          status: 'controlled',
          controlledAt: earlier.controlledAt,
          isPauseRequested: earlier.isPauseRequested,
          state: earlier.state,
          taskID: earlier.taskID,
        }
      : { status: 'reused' };
  }

  const task = store.tasks.findFirst((query) => query.where({ taskID: input.taskID }));

  if (task === undefined) {
    return { status: 'task_not_found' };
  }

  const isPausedByNixie = control === 'resume' && probeMockTaskPaused(task.taskID);

  const isPausedOnItsOwn =
    task.state === 'paused' || (task.state === 'running' && task.isPauseRequested);

  if (isPausedByNixie && !isPausedOnItsOwn) {
    return writeMockExemption(input, control, task);
  }

  // The mock holds no inbox and no task limits, so no message waits unread when a task resumes or
  // restarts, and no limit holds it.
  const plan = planTaskControl(control, {
    state: task.state,
    isConversation: task.taskID === 'conversation',
    isDefinitionTask: false,
    isPauseRequested: task.isPauseRequested,
    hasUnread: false,
    resumeState: task.resumeState,
    isLimitHeld: false,
    controls: task.controls,
  });

  if ('reason' in plan) {
    return match(plan)
      .returnType<TaskControlResult>()
      .with({ reason: 'conversation_never_closes' }, () => ({
        status: 'conversation_never_closes',
      }))
      .with({ reason: 'definition_task_never_closes' }, () => ({
        status: 'definition_task_never_closes',
      }))
      .with({ reason: 'runner_lacks_control' }, () => ({ status: 'runner_lacks_control' }))
      .with({ reason: 'unknown_task' }, { reason: 'not_allowed' }, { reason: 'at_limit' }, () => ({
        status: 'state_refused',
        state: task.state,
        isPauseRequested: task.isPauseRequested,
      }))
      .exhaustive();
  }

  const fields = buildControlledFields(plan);

  const controlled = {
    controlledAt: new Date(),
    isPauseRequested: fields.isPauseRequested ?? task.isPauseRequested,
    state: fields.state ?? task.state,
    taskID: task.taskID,
  };

  await store.tasks.update(task, {
    data(draft) {
      draft.state = controlled.state;
      draft.isPauseRequested = controlled.isPauseRequested;
      draft.resumeState = fields.resumeState === undefined ? draft.resumeState : fields.resumeState;
      draft.lastActivityAt = controlled.controlledAt;

      if (plan.kind === 'task.closed') {
        draft.closedBy = 'owner';
      }
    },
  });

  if (plan.kind === 'task.stopped') {
    await store.taskActions.updateMany(
      (query) => query.where({ attempts: 0, isCancelled: false, taskID: task.taskID }),
      {
        data(draft) {
          draft.isCancelled = true;
        },
      },
    );
  }

  if (isPausedByNixie) {
    await pauseStore.pauseExemptions.create({ taskID: task.taskID });
  }

  await store.taskControlActions.create({
    clientActionID: input.clientActionID,
    control,
    ...controlled,
  });

  return { status: 'controlled', ...controlled };
}

// A resume of a task that nixie's pause stops, with nothing else holding it, only lifts the pause
// from that task.
async function writeMockExemption(
  input: TaskControlInput,
  control: MockTaskControl,
  task: MockTask,
): Promise<TaskControlResult> {
  await pauseStore.pauseExemptions.create({ taskID: task.taskID });

  const controlled = {
    controlledAt: new Date(),
    isPauseRequested: task.isPauseRequested,
    state: task.state,
    taskID: task.taskID,
  };

  await store.taskControlActions.create({
    clientActionID: input.clientActionID,
    control,
    ...controlled,
  });

  return { status: 'controlled', ...controlled };
}
