import type { TaskControl } from '@heynixie/task-control';
import { buildControlledFields, planTaskControl } from '@heynixie/task-control';
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

  // The mock holds no inbox, so no message waits unread when a task resumes or restarts.
  const plan = planTaskControl(control, {
    state: task.state,
    isConversation: task.taskID === 'conversation',
    isPauseRequested: task.isPauseRequested,
    hasUnread: false,
    resumeState: task.resumeState,
  });

  if ('reason' in plan) {
    return plan.reason === 'conversation_never_closes'
      ? { status: 'conversation_never_closes' }
      : { status: 'state_refused', state: task.state, isPauseRequested: task.isPauseRequested };
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
    },
  });

  await store.taskControlActions.create({
    clientActionID: input.clientActionID,
    control,
    ...controlled,
  });

  return { status: 'controlled', ...controlled };
}
