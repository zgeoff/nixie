import type { Log, LogTables } from '@heynixie/log';

export async function readNewestMessage(
  log: Pick<Log, 'writer'>,
  thread: string,
): Promise<number | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'owner_message')
    .where('thread', '=', thread)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.sequence ?? null;
}
