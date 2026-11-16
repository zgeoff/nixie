import { readRecords } from '@heynixie/log';
import type {
  TaskMessageKind,
  TaskMessaging,
  TaskProfile,
  TaskState,
  TasksContext,
  TasksTables,
} from '../types';
import { taskCreatedCodec } from './codec/task-created-codec';
import { readDefinitionTaskVersions } from './read-definition-task-versions';

export interface TaskListQuery {
  readonly callerID: string | null;
  readonly limit: number;
}

export interface ListedTask {
  readonly id: string;
  readonly name: string;
  readonly state: TaskState;
  readonly isPauseRequested: boolean;
  readonly brief: string;
  readonly lastActivityAt: Date;

  readonly model: string | null;
  readonly lastSentKind: TaskMessageKind | null;

  readonly waitingOn?: string;
}

export async function readTaskList(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  messaging: Pick<TaskMessaging, 'directory'>,
  query: TaskListQuery,
): Promise<readonly ListedTask[]> {
  const definitions = await readDefinitionTaskVersions(context);

  // A definition's task out of force is in no directory, and shows while a task run of it is
  // pending or open, under the name of the version that task run pins.
  const outOfForce = definitions
    .filter((entry) => !entry.isInForce)
    .map((entry): TaskProfile => ({
      taskID: entry.taskID,
      name: entry.version.name,
      brief: entry.version.brief,
      wakeable: false,
      speaker: entry.version.persona === 'default' ? 'persona_task' : 'plain_task',
    }));

  const profiles = [...messaging.directory, ...outOfForce].filter(
    (profile) => profile.taskID !== query.callerID,
  );

  if (profiles.length === 0) {
    return [];
  }

  const db = context.log.writer.db.$extendTables<TasksTables>();

  const rows = await db
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.updated_sequence')
    .select([
      'tasks.task_id',
      'tasks.state',
      'tasks.pause_requested',
      'tasks.created_sequence',
      'records.recorded_at',
    ])
    .where(
      'tasks.task_id',
      'in',
      profiles.map((profile) => profile.taskID),
    )
    .orderBy('tasks.updated_sequence', 'desc')
    .limit(query.limit)
    .execute();

  if (rows.length === 0) {
    return [];
  }

  const waits = await db
    .selectFrom('task_messages')
    .select(['from_task', 'to_task'])
    .where('wait_state', '=', 'open')
    .orderBy('sent_sequence')
    .execute();

  const waitingOn = new Map(waits.map((wait) => [wait.from_task, wait.to_task]));

  const sent = await db
    .selectFrom('task_messages')
    .select(['from_task', 'kind'])
    .where(
      'from_task',
      'in',
      rows.map((row) => row.task_id),
    )
    .orderBy('sent_sequence')
    .execute();

  const lastSentKinds = new Map(sent.map((message) => [message.from_task, message.kind]));

  const created = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
    limit: rows.length,
  });

  const models = new Map([
    ...created.map((entry) => {
      const payload = taskCreatedCodec.decode(entry.record.payload);

      return [payload.taskID, payload.options?.model ?? null] as const;
    }),
    ...definitions.map((entry) => [entry.taskID, entry.version.model] as const),
  ]);

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
            model: models.get(row.task_id) ?? null,
            lastSentKind: lastSentKinds.get(row.task_id) ?? null,
            ...(target === undefined ? {} : { waitingOn: target }),
          },
        ];
  });
}
