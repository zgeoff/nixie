import type { Log } from '@heynixie/log';
import type { CodingTables } from '../types';

// The adapter's session ID that a short ID names, or null when no session has it.
export async function readSessionByShortID(
  log: Pick<Log, 'writer'>,
  adapter: string,
  shortID: string,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<CodingTables>()
    .selectFrom('coding_session_ids')
    .select('session_id')
    .where('adapter', '=', adapter)
    .where('short_id', '=', shortID)
    .executeTakeFirst();

  return row?.session_id ?? null;
}
