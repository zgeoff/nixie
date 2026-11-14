import { join } from 'node:path';
import { formatBackupSetName } from './format-backup-set-name';

export function getBackupSetDir(stagingDir: string, sequence: number): string {
  return join(stagingDir, formatBackupSetName(sequence));
}
