import { join } from 'node:path';
import type { BackupReceipt } from '@heynixie/wire';
import { backupSetFiles, backupSetLayout, formatBackupFile, readBackupSets } from '@heynixie/wire';
import type { JobFiles } from './local-job-files';
import type { JobConfig } from './parse-job-config';
import type { BackupRepos } from './publish-backup-set';
import { publishBackupSet } from './publish-backup-set';

// nixie stages one set at a time and writes each one's marker last, so a set with no marker is
// either still copying or one a crash stopped, and the job ships neither. Sets ship in sequence
// order, so the newest key snapshot is always the newest set's.
export async function runJobPass(
  config: Pick<JobConfig, 'stagingDir' | 'retention'>,
  repos: BackupRepos,
  files: JobFiles,
): Promise<readonly BackupReceipt[]> {
  const sets = await readBackupSets(config.stagingDir);

  const receipts: BackupReceipt[] = [];

  for (const set of sets.filter((entry) => entry.hasMarker && !entry.hasReceipt)) {
    const receipt = await publishBackupSet(repos, config.retention, set);

    await writeReceipt(files, set.directory, receipt);
    await removeCopies(files, set.directory);

    receipts.push(receipt);
  }

  return receipts;
}

async function writeReceipt(
  files: JobFiles,
  directory: string,
  receipt: BackupReceipt,
): Promise<void> {
  const path = join(directory, backupSetLayout.receipt);
  const partial = `${path}.partial`;

  await files.writeFile(partial, formatBackupFile(receipt));
  await files.writeToDisk(partial);
  await files.renameFile(partial, path);

  await writeSetDirectoryToDisk(files, directory);
}

// nixie records a receipt and removes its set as soon as the receipt is in place, so the set's
// directory can be gone by then, and nixie then holds the receipt already.
async function writeSetDirectoryToDisk(files: JobFiles, directory: string): Promise<void> {
  try {
    await files.writeToDisk(directory);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function removeCopies(files: JobFiles, directory: string): Promise<void> {
  for (const file of backupSetFiles) {
    await files.removeFile(join(directory, file));
  }

  await writeSetDirectoryToDisk(files, directory);
}
