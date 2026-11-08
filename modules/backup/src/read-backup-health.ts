import type { BackupNotice, BackupTables, BackupWriter } from './types';

export interface BackupHealth {
  readonly lastUploadAt: number | null;
  readonly newestSetAt: number | null;
  readonly notice: BackupNotice | null;
}

export async function readBackupHealth(writer: Pick<BackupWriter, 'db'>): Promise<BackupHealth> {
  const db = writer.db.$extendTables<BackupTables>();

  const sets = await db
    .selectFrom('backup_sets')
    .select((eb) => [
      eb.fn.max('received_at').filterWhere('state', '=', 'published').as('last_upload_at'),
      eb.fn.max('sequence').filterWhere('state', '=', 'published').as('last_published'),
      eb.fn
        .max('staged_at')
        .filterWhere('state', 'in', ['staged', 'published', 'failed'])
        .as('newest_set_at'),
    ])
    .executeTakeFirst();

  const notice = await db
    .selectFrom('backup_notices')
    .select(['sequence', 'cause', 'raised_at'])
    .where('sequence', '>', sets?.last_published ?? 0)
    .orderBy('raised_at', 'desc')
    .orderBy('sequence', 'desc')
    .executeTakeFirst();

  return {
    lastUploadAt: sets?.last_upload_at ?? null,
    newestSetAt: sets?.newest_set_at ?? null,
    notice:
      notice === undefined
        ? null
        : { sequence: notice.sequence, cause: notice.cause, raisedAt: notice.raised_at },
  };
}
