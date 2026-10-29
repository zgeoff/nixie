import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupSetKind, BackupSetManifest } from '@heynixie/wire';
import {
  backupSetFiles,
  backupSetLayout,
  formatBackupFile,
  formatBackupSetName,
  readFileSHA256,
} from '@heynixie/wire';

export interface StagedSetOptions {
  readonly stagingDir: string;
  readonly sequence: number;
  readonly kind: BackupSetKind;
  readonly isComplete: boolean;
}

// The job never opens a database, so a set's copies are any bytes, and the set holds the manifest
// and the marker that nixie writes when the set is complete.
export async function createStagedSet(options: StagedSetOptions): Promise<string> {
  const directory = join(options.stagingDir, formatBackupSetName(options.sequence));

  await mkdir(directory, { recursive: true });

  const copies = await Promise.all(
    backupSetFiles.map(async (name) => {
      const path = join(directory, name);

      await writeFile(path, `${name} of set ${String(options.sequence)}\n`);

      const digest = await readFileSHA256(path);

      return { name, bytes: digest.bytes, sha256: digest.sha256 };
    }),
  );

  if (!options.isComplete) {
    return directory;
  }

  const manifest: BackupSetManifest = {
    format: 1,
    kind: options.kind,
    sequence: options.sequence,
    stagedAt: 1_798_761_600_000,
    copies,
  };

  await writeFile(join(directory, backupSetLayout.manifest), formatBackupFile(manifest));
  await writeFile(join(directory, backupSetLayout.marker), '');

  return directory;
}
