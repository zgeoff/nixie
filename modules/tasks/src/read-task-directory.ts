import { readRecords } from '@heynixie/log';
import type { TaskMessaging, TaskProfile, TasksContext, TasksTables } from './types';

export async function readTaskDirectory<Messaging extends Pick<TaskMessaging, 'directory'>>(
  context: Pick<TasksContext, 'log'>,
  messaging: Messaging,
): Promise<Messaging> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence'])
    .where('started_by', 'is not', null)
    .orderBy('created_sequence')
    .execute();

  if (rows.length === 0) {
    return messaging;
  }

  const created = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
    limit: rows.length,
  });

  const fields = new Map(created.map((entry) => [entry.record.sequence, entry.record.erasable]));

  const started = rows.map((row): TaskProfile => {
    const erasable = fields.get(row.created_sequence);
    const name = erasable?.status === 'readable' ? erasable.fields['name'] : undefined;
    const brief = erasable?.status === 'readable' ? erasable.fields['brief'] : undefined;

    return {
      taskID: row.task_id,
      name: typeof name === 'string' ? name : `Task ${row.task_id}`,
      brief: typeof brief === 'string' ? brief : '',
      isWokenByMessages: true,
    };
  });

  return { ...messaging, directory: [...messaging.directory, ...started] };
}
