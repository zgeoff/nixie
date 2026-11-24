import { withWriteTransaction } from '@heynixie/log';
import { getBackupSetDir } from '@heynixie/wire';
import type { BackupContext, BackupTables } from '../types';
import { getBackupStagingDir } from './get-backup-staging-dir';
import { removeRecordedSet } from './remove-recorded-set';
import { writeBackupSetState } from './write-backup-set-state';

// A set that started before a finished erasure may hold a key the erasure deleted. Only a set with
// no receipt goes, because the pass records every receipt first. A published set that started after
// the erasure covers it, and the withdrawal stops.
export async function removeStaleForgetSets(context: BackupContext): Promise<readonly number[]> {
  const stale = await withWriteTransaction(context.writer, async (tx) => {
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

  const stagingDir = getBackupStagingDir(context.writer.dataDir);

  for (const set of stale) {
    await removeRecordedSet(context.storage.files, getBackupSetDir(stagingDir, set.sequence));

    await withWriteTransaction(context.writer, (tx) =>
      writeBackupSetState(tx, set.sequence, 'abandoned'),
    );
  }

  return stale.map((set) => set.sequence);
}
