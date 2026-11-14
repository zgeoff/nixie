import type { Log, LogTables } from '@heynixie/log';
import type { TasksRecordKind } from '@heynixie/tasks';
import { sql } from 'kysely';

const ownerMessageKind: TasksRecordKind = 'owner_message';

export async function readMessageTimeZone(log: Pick<Log, 'writer'>): Promise<string | null> {
  const timeZone = sql`json_extract(payload, '$.timeZone')`;

  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(timeZone.as('timeZone'))
    .where('kind', '=', ownerMessageKind)
    .where(timeZone, 'is not', null)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return typeof row?.timeZone === 'string' ? row.timeZone : null;
}
