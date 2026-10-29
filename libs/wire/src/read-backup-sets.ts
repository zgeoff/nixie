import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { backupSetLayout } from './backup-set-layout';
import { parseBackupSetName } from './parse-backup-set-name';

export interface BackupSetEntry {
  readonly sequence: number;
  readonly directory: string;
  readonly hasMarker: boolean;
  readonly hasReceipt: boolean;
}

export async function readBackupSets(stagingDir: string): Promise<readonly BackupSetEntry[]> {
  const names = await readdir(stagingDir).catch((error: unknown) => {
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
        hasMarker: await Bun.file(join(directory, backupSetLayout.marker)).exists(),
        hasReceipt: await Bun.file(join(directory, backupSetLayout.receipt)).exists(),
      };
    }),
  );

  return entries
    .filter((entry) => entry !== null)
    .toSorted((first, second) => first.sequence - second.sequence);
}
