import type { TaskMessaging, TaskState, TasksContext, TasksTables } from './types';

type TaskListState = 'active' | 'waiting' | 'done' | 'all';

export interface TaskListQuery {
  readonly callerID: string | null;
  readonly state: TaskListState;
  readonly limit: number;
}

export interface ListedTask {
  readonly id: string;
  readonly name: string;
  readonly state: TaskState;
  readonly isPauseRequested: boolean;
  readonly brief: string;
  readonly lastActivityAt: Date;

  readonly waitingOn?: string;
}

const listedStates: Readonly<Record<TaskListState, readonly TaskState[]>> = {
  active: ['ready', 'running'],
  waiting: ['waiting', 'paused', 'stopped'],
  done: ['done', 'failed', 'closed'],
  all: ['ready', 'running', 'waiting', 'paused', 'stopped', 'done', 'failed', 'closed'],
};

export async function readTaskList(
  context: Pick<TasksContext, 'log'>,
  messaging: Pick<TaskMessaging, 'directory'>,
  query: TaskListQuery,
): Promise<readonly ListedTask[]> {
  const profiles = messaging.directory.filter((profile) => profile.taskID !== query.callerID);

  if (profiles.length === 0) {
    return [];
  }

  const db = context.log.writer.db.$extendTables<TasksTables>();

  const rows = await db
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.updated_sequence')
    .select(['tasks.task_id', 'tasks.state', 'tasks.pause_requested', 'records.recorded_at'])
    .where(
      'tasks.task_id',
      'in',
      profiles.map((profile) => profile.taskID),
    )
    .where('tasks.state', 'in', listedStates[query.state])
    .orderBy('tasks.updated_sequence', 'desc')
    .limit(query.limit)
    .execute();

  const waits = await db
    .selectFrom('task_messages')
    .select(['from_task', 'to_task'])
    .where('wait_state', '=', 'open')
    .orderBy('sent_sequence')
    .execute();

  const waitingOn = new Map(waits.map((wait) => [wait.from_task, wait.to_task]));

  return rows.flatMap((row) => {
    const profile = profiles.find((candidate) => candidate.taskID === row.task_id);
    const target = waitingOn.get(row.task_id);

    return profile === undefined
      ? []
      : [
          {
            id: row.task_id,
            name: profile.name,
            state: row.state,
            isPauseRequested: row.pause_requested === 1,
            brief: profile.brief,
            lastActivityAt: new Date(row.recorded_at),
            ...(target === undefined ? {} : { waitingOn: target }),
          },
        ];
  });
}
