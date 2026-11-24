import { join } from 'node:path';
import { withWriteTransaction } from '@heynixie/log';
import { backupSetLayout, getBackupSetDir } from '@heynixie/wire';
import type { BackupContext, BackupTables } from '../types';
import { getBackupStagingDir } from './get-backup-staging-dir';
import { removeRecordedSet } from './remove-recorded-set';
import { writeBackupFloor } from './write-backup-floor';
import { writeBackupSetState } from './write-backup-set-state';

// A set that started before a finished erasure may hold a key the erasure deleted. Only a set with
// no receipt goes, and a published set that started after the erasure covers it. While a job pass
// holds the staging lock the withdrawal waits for the next pass, so it never removes a set in flight.
export async function removeStaleForgetSets(context: BackupContext): Promise<readonly number[]> {
  const stale = await withWriteTransaction(context.writer, async (tx) => {
    await writeBackupFloor(context, tx);

    const db = tx.$extendTables<BackupTables>();

    const finished = await db
      .selectFrom('records')
      .select((eb) => eb.fn.max('sequence').as('sequence'))
      .where('kind', '=', 'erasure.finished')
      .executeTakeFirst();

    const published = await db
      .selectFrom('backup_sets')
      .select((eb) => eb.fn.max('log_head').as('log_head'))
      .where('state', '=', 'published')
      .executeTakeFirst();

    const finishedSequence = finished?.sequence ?? null;

    if (finishedSequence === null || (published?.log_head ?? -1) >= finishedSequence) {
      return [];
    }

    return db
      .selectFrom('backup_sets')
      .select('sequence')
      .where('state', '=', 'staged')
      .where('log_head', '<', finishedSequence)
      .execute();
  });

  if (stale.length === 0) {
    return [];
  }

  const files = context.storage.files;
  const stagingDir = getBackupStagingDir(context.writer.dataDir);
  const lockPath = join(stagingDir, backupSetLayout.jobLock);

  await files.writeFile(lockPath, '');

  const lock = context.storage.claimFileLock(lockPath, 'exclusive');

  if (lock === null) {
    return [];
  }

  try {
    for (const set of stale) {
      await removeRecordedSet(files, getBackupSetDir(stagingDir, set.sequence));

      await withWriteTransaction(context.writer, (tx) =>
        writeBackupSetState(tx, set.sequence, 'abandoned'),
      );
    }
  } finally {
    lock.release();
  }

  return stale.map((set) => set.sequence);
}
