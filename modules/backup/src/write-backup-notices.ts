import { withWriteTransaction } from '@heynixie/log';
import { pickBackupNotices } from './pick-backup-notices';
import type { BackupContext, BackupNotice, BackupTables } from './types';

export function writeBackupNotices(
  context: BackupContext,
  intervalMs: number,
): Promise<readonly BackupNotice[]> {
  return withWriteTransaction(context.writer, async (tx) => {
    const db = tx.$extendTables<BackupTables>();

    const sets = await db
      .selectFrom('backup_sets')
      .select(['sequence', 'state', 'staged_at'])
      .where('state', 'in', ['staged', 'published', 'failed'])
      .orderBy('sequence')
      .execute();

    const raised = await db.selectFrom('backup_notices').select(['sequence', 'cause']).execute();

    const raisedAt = context.writer.clock.now();

    const notices = pickBackupNotices(sets, raised, raisedAt, intervalMs).map(
      (notice): BackupNotice => ({ sequence: notice.sequence, cause: notice.cause, raisedAt }),
    );

    if (notices.length > 0) {
      await db
        .insertInto('backup_notices')
        .values(
          notices.map((notice) => ({
            sequence: notice.sequence,
            cause: notice.cause,
            raised_at: notice.raisedAt,
          })),
        )
        .execute();
    }

    return notices;
  });
}
