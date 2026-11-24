import { join } from 'node:path';
import type { BackupSetEntry } from '@heynixie/wire';
import { backupFloorSchema, backupSetLayout, parseBackupFile } from '@heynixie/wire';
import type { JobFiles } from './local-job-files';

// True when the set started before the newest finished erasure, so it may hold a key that the
// erasure deleted. A missing floor means no erasure has finished. A floor that does not parse fails
// the pass: shipping a set on a guess could publish a deleted key.
export async function probeSetBelowFloor(
  files: Pick<JobFiles, 'readText'>,
  stagingDir: string,
  set: BackupSetEntry,
): Promise<boolean> {
  const text = await files
    .readText(join(stagingDir, backupSetLayout.floor))
    .catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    });

  if (text === null) {
    return false;
  }

  const floor = parseBackupFile(text, backupFloorSchema);

  if ('refused' in floor) {
    throw new Error(`the backup floor in ${stagingDir}: ${floor.refused}`);
  }

  return set.sequence <= floor.value.sequence;
}
