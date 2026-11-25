import type { ActionsTables } from '@heynixie/actions';
import type { Log } from '@heynixie/log';

export interface ActionFacts {
  // the task whose call queued the action: the conversation or the task that sends
  readonly taskID: string;

  // the thread of the call that queued the action, whose files the action may send
  readonly thread: string;

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
    .leftJoin('records', 'records.sequence', 'actions.queued_sequence')
    .select(['actions.task_id', 'actions.first_attempt_at', 'records.thread'])
    .where('actions.action_id', '=', actionID)
    .executeTakeFirst();

  return row === undefined
    ? null
    : {
        taskID: row.task_id,
        thread: row.thread ?? row.task_id,
        firstAttemptAt: row.first_attempt_at,
      };
}
