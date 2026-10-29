import { join } from 'node:path';
import type { FileLockMode } from '@heynixie/async';
import type { DataStorage } from './data-storage';
import type { WriterLock } from './types';

// The writer lock cannot keep a backup from a restore, because a backup runs beside the server that
// holds it. Backups share this lock with each other, and a restore holds it alone.
export async function claimBackupLock(
  storage: DataStorage,
  dataDir: string,
  mode: FileLockMode,
): Promise<WriterLock | null> {
  const path = join(dataDir, 'backup.lock');

  await storage.files.writeFile(path, '');

  return storage.claimFileLock(path, mode);
}
