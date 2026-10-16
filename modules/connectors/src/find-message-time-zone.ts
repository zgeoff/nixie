import type { Log, LogTables } from '@heynixie/log';
import type { TasksRecordKind } from '@heynixie/tasks';
import { sql } from 'kysely';

// Finds the time zone of the newest owner message that carries one, in any thread, or null when no
// message does. The API keeps the zone in the message's payload, outside its erasable fields, so
// the zone stays readable after the message's text is forgotten.
export async function findMessageTimeZone(log: Pick<Log, 'writer'>): Promise<string | null> {
  const timeZone = sql<string | null>`json_extract(payload, '$.timeZone')`;

  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(timeZone.as('timeZone'))
    .where('kind', '=', ownerMessageKind)
    .where(timeZone, 'is not', null)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.timeZone ?? null;
}

// the tasks module registers the owner message's kind with the log, as an inbox kind
const ownerMessageKind: TasksRecordKind = 'owner_message';
