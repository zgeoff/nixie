import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TaskBrief } from './task-brief';
import { taskCreatedCodec } from './task-created-codec';
import type { TasksContext, TasksTables } from './types';

// The brief of each started task among the given IDs. A task with no startedBy, such as the
// conversation, the memory tasks and a harness-created task, has none and is left out.
export async function readTaskBriefs(
  context: Pick<TasksContext, 'log'>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, TaskBrief>> {
  if (taskIDs.length === 0) {
    return new Map();
  }

  const db = context.log.writer.db.$extendTables<TasksTables>();

  const rows = await db
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence', 'started_by'])
    .where('task_id', 'in', taskIDs)
    .where('started_by', 'is not', null)
    .execute();

  if (rows.length === 0) {
    return new Map();
  }

  const created = await readRecordsBySequence(
    context,
    rows.map((row) => row.created_sequence),
  );

  const named = rows.map((row) => ({
    taskID: row.task_id,
    startedBy: row.started_by ?? '',
    created: created.get(row.created_sequence),
  }));

  const messageIDs = named.flatMap((task) => {
    const messageID =
      task.created === undefined
        ? undefined
        : taskCreatedCodec.tryDecodePartial(task.created.payload)?.briefMessageID;

    return messageID === undefined ? [] : [messageID];
  });

  const sent =
    messageIDs.length === 0
      ? []
      : await db
          .selectFrom('task_messages')
          .select(['message_id', 'sent_sequence'])
          .where('message_id', 'in', messageIDs)
          .execute();

  const records = await readRecordsBySequence(
    context,
    sent.map((row) => row.sent_sequence),
  );

  const sequences = new Map(sent.map((row) => [row.message_id, row.sent_sequence]));
  const briefs = new Map<string, TaskBrief>();

  for (const task of named) {
    const brief = buildTaskBrief(task, sequences, records);

    if (brief !== null) {
      briefs.set(task.taskID, brief);
    }
  }

  return briefs;
}

async function readRecordsBySequence(
  context: Pick<TasksContext, 'log'>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const entries = await readRecords(context.log, {
    afterSequence: 0,
    sequences,
    limit: sequences.length,
  });

  return new Map(entries.map((entry) => [entry.record.sequence, entry.record]));
}

interface NamedTask {
  readonly taskID: string;
  readonly startedBy: string;
  readonly created: LogRecord | undefined;
}

function buildTaskBrief(
  task: NamedTask,
  sequences: ReadonlyMap<string, number>,
  records: ReadonlyMap<number, LogRecord>,
): TaskBrief | null {
  if (task.created === undefined) {
    return null;
  }

  const messageID = taskCreatedCodec.tryDecodePartial(task.created.payload)?.briefMessageID;

  if (messageID === undefined) {
    // Remove this branch when no open task lacks a briefMessageID.
    return buildCreatedBrief(task.taskID, task.startedBy, task.created);
  }

  const record = records.get(sequences.get(messageID) ?? 0);

  return record === undefined
    ? null
    : {
        origin: 'message',
        messageID,
        from: task.startedBy,
        sequence: record.sequence,
        sentAt: record.recordedAt,
        body: findBody(record, 'body'),
      };
}

// A task that the release before started holds its brief in the erasable fields of its
// task.created record, and a task with no brief there has none.
function buildCreatedBrief(
  taskID: string,
  startedBy: string,
  created: LogRecord,
): TaskBrief | null {
  const erasable = created.erasable;
  const isForgotten = erasable.status !== 'readable';
  const body = findBody(created, 'brief');

  if (!isForgotten && body === null) {
    return null;
  }

  return {
    origin: 'created',
    taskID,
    from: startedBy,
    sequence: created.sequence,
    sentAt: created.recordedAt,
    body,
  };
}

function findBody(record: LogRecord, field: string): string | null {
  const value = record.erasable.status === 'readable' ? record.erasable.fields[field] : undefined;

  return typeof value === 'string' ? value : null;
}
