import type { ActionsTables } from '@heynixie/actions';
import type { Log } from '@heynixie/log';

export interface ActionFacts {
  // the task whose call queued the action: the conversation or the task that sends
  readonly taskID: string;

  // epoch ms: when the first attempt began, which a retry and a reconcile of the action share; null
  // before any attempt
  readonly firstAttemptAt: number | null;
}

export async function readActionFacts(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<ActionFacts | null> {
  const row = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['task_id', 'first_attempt_at'])
    .where('action_id', '=', actionID)
    .executeTakeFirst();

  return row === undefined ? null : { taskID: row.task_id, firstAttemptAt: row.first_attempt_at };
}
