import { store } from './store';

type MoveTarget =
  | { readonly kind: 'task'; readonly taskID: string }
  | { readonly kind: 'new'; readonly name: string; readonly brief: string };

interface MoveInput {
  readonly clientActionID: string;
  readonly sequence: number;
  readonly thread: string;
  readonly to: MoveTarget;
}

type MoveResult =
  | { readonly status: 'moved'; readonly movedAt: Date; readonly taskID: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'task_not_found' }
  | { readonly status: 'takes_no_messages' }
  | { readonly status: 'already_there' }
  | { readonly status: 'reused' };

export async function writeMockMove(input: MoveInput): Promise<MoveResult> {
  const earlier = store.moveActions.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.sequence === input.sequence
      ? { status: 'moved', movedAt: earlier.movedAt, taskID: earlier.taskID }
      : { status: 'reused' };
  }

  const message = store.records.findFirst((query) =>
    query.where(
      (record) =>
        record.sequence === input.sequence &&
        record.thread === input.thread &&
        record.kind === 'owner_message',
    ),
  );

  if (message === undefined) {
    return { status: 'not_found' };
  }

  const from =
    store.records
      .findMany((query) =>
        query.where((record) => record.route?.messages.includes(input.sequence) === true),
      )
      .at(-1)?.route?.taskID ?? input.thread;

  const target = await resolveMoveTarget(input.to);

  if (target.status !== 'found') {
    return target;
  }

  const taskID = target.taskID;

  if (taskID === from) {
    return { status: 'already_there' };
  }

  const moved = await store.records.create({
    kind: 'task.route_corrected',
    route: { isMove: true, messages: [input.sequence], taskID },
    thread: input.thread,
  });

  await store.moveActions.create({
    clientActionID: input.clientActionID,
    movedAt: moved.recordedAt,
    sequence: input.sequence,
    taskID,
  });

  return { status: 'moved', movedAt: moved.recordedAt, taskID };
}

type MoveTargetResult =
  | { readonly status: 'found'; readonly taskID: string }
  | { readonly status: 'task_not_found' }
  | { readonly status: 'takes_no_messages' };

async function resolveMoveTarget(to: MoveTarget): Promise<MoveTargetResult> {
  if (to.kind === 'new') {
    const task = await store.tasks.create({ brief: to.brief, name: to.name, state: 'ready' });

    return { status: 'found', taskID: task.taskID };
  }

  const task = store.tasks.findFirst((query) => query.where({ taskID: to.taskID }));

  if (task === undefined || task.state === 'done' || task.state === 'failed') {
    return { status: 'task_not_found' };
  }

  return task.isTakingMessages
    ? { status: 'found', taskID: task.taskID }
    : { status: 'takes_no_messages' };
}
