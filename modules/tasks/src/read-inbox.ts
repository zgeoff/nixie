import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { isInboxRecord } from './is-inbox-record';
import type { TasksContext, TasksTables } from './types';

// Reads a task's unread inbox, oldest first: every inbox record past its read cursor, with its
// erasable fields decrypted. A step passes each record's sequence back once the model read it.
export async function readInbox(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<readonly LogRecord[]> {
  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('read_cursor')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();
  const inbox: LogRecord[] = [];
  const cursor = { after: task.read_cursor, done: false };

  while (!cursor.done) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts after the one before it
    const page = await readRecords(context.log, { afterSequence: cursor.after, thread: taskID });

    inbox.push(...page.map((entry) => entry.record).filter((record) => isInboxRecord(record)));
    cursor.after = page.at(-1)?.record.sequence ?? cursor.after;
    cursor.done = page.length === 0;
  }
  return inbox;
}
