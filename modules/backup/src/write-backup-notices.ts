import { withWriteTransaction } from '@heynixie/log';
import { pickBackupNotices } from './pick-backup-notices';
import type { BackupContext, BackupNotice, BackupTables } from './types';

export async function writeBackupNotices(
  context: BackupContext,
  intervalMs: number,
): Promise<readonly BackupNotice[]> {
  const db = context.writer.db.$extendTables<BackupTables>();

  const lastPublished = db
    .selectFrom('backup_sets')
    .select((eb) => eb.fn.coalesce(eb.fn.max('sequence'), eb.lit(0)).as('sequence'))
    .where('state', '=', 'published');

  const sets = await db
    .selectFrom('backup_sets')
    .select(['sequence', 'state', 'staged_at'])
    .where('state', 'in', ['staged', 'published', 'failed'])
    .where('sequence', '>=', lastPublished)
    .orderBy('sequence')
    .execute();

  const raised = await db
    .selectFrom('backup_notices')
    .select(['sequence', 'cause'])
    .where('sequence', '>=', lastPublished)
    .execute();

  const raisedAt = context.writer.clock.now();

  const notices = pickBackupNotices(sets, raised, raisedAt, intervalMs).map(
    (notice): BackupNotice => ({ sequence: notice.sequence, cause: notice.cause, raisedAt }),
  );

  if (notices.length === 0) {
    return notices;
  }

  await withWriteTransaction(context.writer, async (tx) => {
    await tx
      .$extendTables<BackupTables>()
      .insertInto('backup_notices')
      .values(
        notices.map((notice) => ({
          sequence: notice.sequence,
          cause: notice.cause,
          raised_at: notice.raisedAt,
        })),
      )
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  });

  return notices;
}
