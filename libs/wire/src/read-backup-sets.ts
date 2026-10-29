import { join } from 'node:path';
import { backupSetLayout } from './backup-set-layout';
import type { BackupFileReads } from './local-backup-file-reads';
import { parseBackupSetName } from './parse-backup-set-name';

export interface BackupSetEntry {
  readonly sequence: number;
  readonly directory: string;
  readonly hasMarker: boolean;
  readonly hasReceipt: boolean;
}

export async function readBackupSets(
  files: Pick<BackupFileReads, 'readDirectory' | 'probeFile'>,
  stagingDir: string,
): Promise<readonly BackupSetEntry[]> {
  const names = await files.readDirectory(stagingDir).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const entries = await Promise.all(
    names.map(async (name) => {
      const sequence = parseBackupSetName(name);

      if (sequence === null) {
        return null;
      }

      const directory = join(stagingDir, name);

      return {
        sequence,
        directory,
        hasMarker: await files.probeFile(join(directory, backupSetLayout.marker)),
        hasReceipt: await files.probeFile(join(directory, backupSetLayout.receipt)),
      };
    }),
  );

  return entries
    .filter((entry) => entry !== null)
    .toSorted((first, second) => first.sequence - second.sequence);
}
