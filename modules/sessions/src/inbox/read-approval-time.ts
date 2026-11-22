import type { LogRecord, LogTables } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { sql } from 'kysely';

// When the owner approved the action that an outcome settles, or null for any other record and for
// an action that no approval queued. The approval renders no message, so its outcome says when.
export async function readApprovalTime(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
): Promise<Date | null> {
  const actionID = record.kind === 'action.outcome' ? record.payload['actionID'] : undefined;

  if (typeof actionID !== 'string' || record.thread === null) {
    return null;
  }

  const row = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('recorded_at')
    .where('kind', '=', 'policy.action_answered')
    .where('thread', '=', record.thread)
    .where('sequence', '<', record.sequence)
    .where(sql`json_extract(payload, '$.actionID')`, '=', actionID)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : new Date(row.recorded_at);
}
