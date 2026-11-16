import { store } from './store';

interface TaskMarkInput {
  readonly clientActionID: string;
  readonly disposable: boolean;
  readonly taskID: string;
}

type MockTaskState = NonNullable<ReturnType<typeof store.tasks.findFirst>>['state'];

type TaskMarkResult =
  | {
      readonly status: 'marked';
      readonly changedAt: Date;
      readonly disposable: boolean;
      readonly taskID: string;
    }
  | { readonly status: 'task_not_found' }
  | { readonly status: 'no_mark' }
  | { readonly status: 'state_refused'; readonly state: MockTaskState }
  | { readonly status: 'reused' };

export async function writeMockTaskMark(input: TaskMarkInput): Promise<TaskMarkResult> {
  const earlier = store.taskMarkActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.taskID === input.taskID && earlier.disposable === input.disposable
      ? {
          status: 'marked',
          changedAt: earlier.changedAt,
          disposable: earlier.disposable,
          taskID: earlier.taskID,
        }
      : { status: 'reused' };
  }

  const task = store.tasks.findFirst((query) => query.where({ taskID: input.taskID }));

  if (task === undefined) {
    return { status: 'task_not_found' };
  }

  if (task.disposable === null) {
    return { status: 'no_mark' };
  }

  if (task.state === 'closed' || task.state === 'done') {
    return { status: 'state_refused', state: task.state };
  }

  const changedAt = new Date();

  await store.tasks.update(task, {
    data(draft) {
      draft.disposable = input.disposable;
    },
  });

  await store.taskMarkActions.create({
    changedAt,
    clientActionID: input.clientActionID,
    disposable: input.disposable,
    taskID: task.taskID,
  });

  return { status: 'marked', changedAt, disposable: input.disposable, taskID: task.taskID };
}
