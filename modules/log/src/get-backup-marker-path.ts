import { join } from 'node:path';

export function getBackupMarkerPath(directory: string): string {
  return join(directory, 'backup-incomplete');
}
