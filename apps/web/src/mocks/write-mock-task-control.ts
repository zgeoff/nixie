import { match } from 'ts-pattern';
import { store } from './store';

export type MockTaskControl = 'pause' | 'resume' | 'stop' | 'restart' | 'close' | 'interrupt';

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

  const task = store.tasks.findFirst((query) => query.where({ taskID: input.taskID }));

  if (earlier !== undefined) {
    return earlier.control === control && earlier.taskID === input.taskID && task !== undefined
      ? {
          status: 'controlled',
          controlledAt: earlier.controlledAt,
          isPauseRequested: task.isPauseRequested,
          state: task.state,
          taskID: task.taskID,
        }
      : { status: 'reused' };
  }

  if (task === undefined) {
    return { status: 'task_not_found' };
  }

  if (control === 'close' && task.taskID === 'conversation') {
    return { status: 'conversation_never_closes' };
  }

  const next = pickTaskMove(control, task);

  if (next === null) {
    return { status: 'state_refused', state: task.state, isPauseRequested: task.isPauseRequested };
  }

  const controlledAt = new Date();

  await store.tasks.update(task, {
    data(draft) {
      draft.state = next.state;
      draft.isPauseRequested = next.isPauseRequested;
      draft.lastActivityAt = controlledAt;
    },
  });

  await store.taskControlActions.create({
    clientActionID: input.clientActionID,
    control,
    controlledAt,
    taskID: task.taskID,
  });

  return { status: 'controlled', controlledAt, ...next, taskID: task.taskID };
}

interface TaskMove {
  readonly state: MockTaskState;
  readonly isPauseRequested: boolean;
}

function pickTaskMove(control: MockTaskControl, task: MockTask): TaskMove | null {
  const isRunning = task.state === 'running';
  const isHeld = task.state === 'stopped' || task.state === 'failed';
  const isFinished = task.state === 'done' || task.state === 'failed' || task.state === 'closed';

  return match(control)
    .returnType<TaskMove | null>()
    .with('pause', () => {
      if (isRunning) {
        return task.isPauseRequested ? null : { state: 'running', isPauseRequested: true };
      }

      return task.state === 'ready' || task.state === 'waiting'
        ? { state: 'paused', isPauseRequested: false }
        : null;
    })
    .with('resume', () => {
      if (isRunning) {
        return task.isPauseRequested ? { state: 'running', isPauseRequested: false } : null;
      }

      return task.state === 'paused' ? { state: 'ready', isPauseRequested: false } : null;
    })
    .with('stop', () =>
      isHeld || isFinished ? null : { state: 'stopped', isPauseRequested: false },
    )
    .with('restart', () => (isHeld ? { state: 'ready', isPauseRequested: false } : null))
    .with('close', () =>
      task.state === 'closed' ? null : { state: 'closed', isPauseRequested: false },
    )
    .with('interrupt', () =>
      isRunning ? { state: 'running', isPauseRequested: task.isPauseRequested } : null,
    )
    .exhaustive();
}
