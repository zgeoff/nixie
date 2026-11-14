import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import type { RestoreNote } from '@heynixie/wire';
import { backupSetLayout, formatBackupFile, readBackupSets } from '@heynixie/wire';
import type { DataStorage } from './data-storage';

export interface BackupStagingReset {
  readonly storage: DataStorage;
  readonly stagingDir: string;
  readonly clock: Pick<Clock, 'now'>;
  readonly keySnapshotID: string | null;
}

// The backup job holds this lock for a whole pass, so a set it is publishing is never removed from
// under it. A held lock fails the restore, because a set staged from the replaced database must not
// publish.
export async function resetBackupStaging(reset: BackupStagingReset): Promise<void> {
  const files = reset.storage.files;
  const lockPath = join(reset.stagingDir, backupSetLayout.jobLock);

  await files.createDirectories(reset.stagingDir);
  await files.writeFile(lockPath, '');

  const lock = reset.storage.claimFileLock(lockPath, 'exclusive');

  if (lock === null) {
    throw new Error(
      `a backup job pass holds the staging lock in ${reset.stagingDir}, so nixie cannot empty it. The restore marker stays and the server will not start. Stop the backup job and run the restore again`,
    );
  }

  try {
    const sets = await readBackupSets(files, reset.stagingDir);

    for (const set of sets) {
      await files.removeFile(set.directory);
    }

    await files.writeDirectoryToDisk(reset.stagingDir);

    await writeRestoreNote(reset);
  } finally {
    lock.release();
  }
}

const noteSuffix = '.writing';

// The temporary name is not a set folder's name, and the rename leaves the job a whole note or none.
async function writeRestoreNote(reset: BackupStagingReset): Promise<void> {
  const files = reset.storage.files;
  const path = join(reset.stagingDir, backupSetLayout.restoreNote);
  const temporary = `${path}${noteSuffix}`;

  const note: RestoreNote = {
    format: 1,
    restoredAt: reset.clock.now(),
    keySnapshotID: reset.keySnapshotID,
  };

  await files.writeFile(temporary, formatBackupFile(note));
  await files.writeFileToDisk(temporary);
  await files.renameFile(temporary, path);
  await files.writeDirectoryToDisk(reset.stagingDir);
}
