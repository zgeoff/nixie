import type { ActionsTables } from '@heynixie/actions';
import type { Log } from '@heynixie/log';

// The task whose call queued an action: the conversation or the task that sends.
export async function readActionTaskID(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('task_id')
    .where('action_id', '=', actionID)
    .executeTakeFirst();

  return row?.task_id ?? null;
}
