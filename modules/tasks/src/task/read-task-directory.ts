import { readRecords } from '@heynixie/log';
import type { TaskMessaging, TaskProfile, TasksContext, TasksTables } from '../types';
import { taskCreatedCodec } from './codec/task-created-codec';
import { readDefinitionTaskVersions } from './read-definition-task-versions';
import { readTaskBriefs } from './read-task-briefs';

export async function readTaskDirectory<Messaging extends Pick<TaskMessaging, 'directory'>>(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  messaging: Messaging,
): Promise<Messaging> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence'])
    .where('started_by', 'is not', null)
    .orderBy('created_sequence')
    .execute();

  const versions = await readDefinitionTaskVersions(context);

  const definitions = versions
    .filter((entry) => entry.isInForce)
    .map((entry): TaskProfile => ({
      taskID: entry.taskID,
      name: entry.version.name,
      brief: entry.version.brief,
      isWokenByMessages: entry.version.wakeable,
      speaker: entry.version.persona === 'default' ? 'persona_task' : 'plain_task',
    }));

  if (rows.length === 0) {
    return { ...messaging, directory: [...messaging.directory, ...definitions] };
  }

  const created = await readRecords(context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
    limit: rows.length,
  });

  const records = new Map(created.map((entry) => [entry.record.sequence, entry.record]));

  const briefs = await readTaskBriefs(
    context,
    rows.map((row) => row.task_id),
  );

  const started = rows.map((row): TaskProfile => {
    const record = records.get(row.created_sequence);
    const erasable = record?.erasable;
    const name = erasable?.status === 'readable' ? erasable.fields['name'] : undefined;
    const options = record === undefined ? null : taskCreatedCodec.tryDecodePartial(record.payload);

    return {
      taskID: row.task_id,
      name: typeof name === 'string' ? name : row.task_id,
      brief: briefs.get(row.task_id)?.body ?? '',
      isWokenByMessages: true,
      speaker: options?.options?.persona === 'default' ? 'persona_task' : 'plain_task',
    };
  });

  return { ...messaging, directory: [...messaging.directory, ...started, ...definitions] };
}
