import { join } from 'node:path';
import type { FileLockMode } from './claim-file-lock';
import type { DataStorage } from './data-storage';
import type { WriterLock } from './types';

// The writer lock cannot keep a backup from a restore, because a backup runs beside the server that
// holds it. Backups share this lock with each other, and a restore holds it alone.
export async function claimBackupLock(
  storage: DataStorage,
  dataDir: string,
  mode: FileLockMode,
): Promise<WriterLock> {
  const path = join(dataDir, 'backup.lock');

  await storage.files.writeFile(path, '');

  const lock = storage.claimFileLock(path, mode);

  if (lock === null) {
    const refusal =
      mode === 'shared'
        ? `a restore runs on the data directory ${dataDir}, so nixie backs up nothing`
        : `a backup runs on the data directory ${dataDir}, so nixie restores nothing`;

    throw new Error(refusal);
  }

  return lock;
}
