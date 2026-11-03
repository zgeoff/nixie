import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext, TasksTables } from './types';

const pageSize = 50;

// A task's message lives on its receiver's thread, so a reader of the sender's own thread never
// sees it.
export async function* readSentTaskMessages(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): AsyncGenerator<LogRecord> {
  const page = { before: Number.MAX_SAFE_INTEGER, size: pageSize };

  while (page.size === pageSize) {
    const rows = await context.log.writer.db
      .$extendTables<TasksTables>()
      .selectFrom('task_messages')
      .select('sent_sequence')
      .where('from_task', '=', taskID)
      .where('sent_sequence', '<', page.before)
      .orderBy('sent_sequence', 'desc')
      .limit(pageSize)
      .execute();

    const sequences = rows.map((row) => row.sent_sequence);

    const entries =
      sequences.length === 0
        ? []
        : await readRecords(context.log, { afterSequence: 0, sequences, order: 'newest' });

    yield* entries.map((entry) => entry.record);
    page.size = rows.length;
    page.before = sequences.at(-1) ?? 0;
  }
}
