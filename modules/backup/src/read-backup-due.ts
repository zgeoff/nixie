import type { Writer } from '@heynixie/log';
import type { BackupTables } from './types';

export interface BackupDue {
  readonly isForgetDue: boolean;
  readonly isSetWaiting: boolean;
  readonly newestStagedAt: number | null;
}

// A forget deletes its key before it writes its forgotten record, so a set whose copy started after
// that record lacks the key. A failed set counts too, so a backend that stays down fails one set
// per interval rather than one per pass.
export async function readBackupDue(writer: Writer): Promise<BackupDue> {
  const db = writer.db.$extendTables<BackupTables>();

  const newest = await db
    .selectFrom('backup_sets')
    .select((eb) => [eb.fn.max('log_head').as('log_head'), eb.fn.max('staged_at').as('staged_at')])
    .where('state', 'in', ['staged', 'published', 'failed'])
    .executeTakeFirst();

  const waiting = await db
    .selectFrom('backup_sets')
    .select('sequence')
    .where('state', '=', 'staged')
    .executeTakeFirst();

  const forgotten = await db
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'memory.forgotten')
    .where('sequence', '>', newest?.log_head ?? 0)
    .executeTakeFirst();

  return {
    isForgetDue: forgotten !== undefined,
    isSetWaiting: waiting !== undefined,
    newestStagedAt: newest?.staged_at ?? null,
  };
}
