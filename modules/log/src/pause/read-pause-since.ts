import type { Kysely } from 'kysely';
import type { LogTables, PauseSince } from '../types';
import { pauseCauseSchema } from './pause-cause-schema';

export async function readPauseSince(db: Kysely<unknown>): Promise<PauseSince | null> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('nixie_pause')
    .innerJoin('records', 'records.sequence', 'nixie_pause.paused_sequence')
    .select(['nixie_pause.cause', 'nixie_pause.recovery_id', 'records.recorded_at'])
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return {
    cause: pauseCauseSchema.parse(row.cause),
    recoveryID: row.recovery_id,
    since: row.recorded_at,
  };
}
