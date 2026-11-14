import type { Kysely } from 'kysely';
import type { LogTables, Pause } from '../types';
import { pauseCauseSchema } from './pause-cause-schema';

export async function readPause(db: Kysely<unknown>): Promise<Pause | null> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('nixie_pause')
    .select(['cause', 'recovery_id'])
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return { cause: pauseCauseSchema.parse(row.cause), recoveryID: row.recovery_id };
}
