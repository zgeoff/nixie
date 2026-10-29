import { join } from 'node:path';

export function getBackupStagingDir(dataDir: string): string {
  return join(dataDir, 'backup');
}
