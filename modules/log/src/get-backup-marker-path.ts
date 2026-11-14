import { join } from 'node:path';
import { unfinishedBackupMarker } from '@heynixie/wire';

export function getBackupMarkerPath(directory: string): string {
  return join(directory, unfinishedBackupMarker);
}
