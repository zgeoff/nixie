import type { Transaction } from 'kysely';
import { pauseCauseSchema } from './pause-cause-schema';
import type { LogTables, Pause } from './types';

export async function readPause(tx: Transaction<unknown>): Promise<Pause | null> {
  const row = await tx
    .$extendTables<LogTables>()
    .selectFrom('nixie_pause')
    .select(['cause', 'recovery_id'])
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return { cause: pauseCauseSchema.parse(row.cause), recoveryID: row.recovery_id };
}
