import type { LogTables } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { RecoveryStarted } from './read-recovery-started';
import { readRecoveryStarted } from './read-recovery-started';

export async function readLatestRecovery(
  tx: Transaction<unknown>,
): Promise<RecoveryStarted | null> {
  const recovery = await tx
    .$extendTables<LogTables>()
    .selectFrom('recoveries')
    .select('started_sequence')
    .orderBy('started_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (recovery === undefined) {
    return null;
  }

  return readRecoveryStarted(tx, recovery.started_sequence);
}
