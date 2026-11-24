import { join } from 'node:path';
import type { WriteTransaction } from '@heynixie/log';
import { backupSetLayout, formatBackupFile } from '@heynixie/wire';
import type { BackupContext, BackupTables } from '../types';
import { getBackupStagingDir } from './get-backup-staging-dir';

type FloorContext = Pick<BackupContext, 'storage'> & {
  readonly writer: Pick<BackupContext['writer'], 'dataDir'>;
};

// Writes the highest set sequence that started before the newest finished erasure. It runs in a
// write transaction, so each set row that exists then sits at or below the floor. The file is renamed
// into place, and a later run repairs a floor that a rolled-back transaction left too high.
export async function writeBackupFloor(context: FloorContext, tx: WriteTransaction): Promise<void> {
  const db = tx.$extendTables<BackupTables>();

  const finished = await db
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .where('kind', '=', 'erasure.finished')
    .executeTakeFirst();

  if (finished?.sequence === null || finished === undefined) {
    return;
  }

  const stale = await db
    .selectFrom('backup_sets')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .where('log_head', '<', finished.sequence)
    .executeTakeFirst();

  const files = context.storage.files;
  const stagingDir = getBackupStagingDir(context.writer.dataDir);
  const path = join(stagingDir, backupSetLayout.floor);
  const partial = `${path}.partial`;

  await files.createDirectories(stagingDir);
  await files.writeFile(partial, formatBackupFile({ format: 1, sequence: stale?.sequence ?? 0 }));
  await files.writeFileToDisk(partial);
  await files.renameFile(partial, path);
  await files.writeDirectoryToDisk(stagingDir);
}
