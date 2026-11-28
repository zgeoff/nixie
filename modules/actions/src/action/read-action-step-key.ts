import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables } from '../types';

// The key of the step that queued the action, or null when no action has that ID.
export async function readActionStepKey(
  context: Pick<TasksContext, 'log'>,
  actionID: string,
): Promise<string | null> {
  const row = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('step_key')
    .where('action_id', '=', actionID)
    .executeTakeFirst();

  return row?.step_key ?? null;
}
