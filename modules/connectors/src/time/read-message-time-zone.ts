import type { Log, LogTables } from '@heynixie/log';
import type { TasksRecordKind } from '@heynixie/tasks';
import { sql } from 'kysely';

const ownerMessageKind: TasksRecordKind = 'owner_message';

// With beforeSequence, only the owner messages recorded before that sequence count.
export async function readMessageTimeZone(
  log: Pick<Log, 'writer'>,
  beforeSequence?: number,
): Promise<string | null> {
  const timeZone = sql`json_extract(payload, '$.timeZone')`;

  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(timeZone.as('timeZone'))
    .where('kind', '=', ownerMessageKind)
    .where(timeZone, 'is not', null)
    .$if(beforeSequence !== undefined, (query) => query.where('sequence', '<', beforeSequence ?? 0))
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return typeof row?.timeZone === 'string' ? row.timeZone : null;
}
