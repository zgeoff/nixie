import { join } from 'node:path';

export function getRestoreMarkerPath(dataDir: string): string {
  return join(dataDir, 'restore-incomplete');
}
