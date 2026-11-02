import { join } from 'node:path';
import type { BackupReceipt } from '@heynixie/wire';
import { backupSetFiles, backupSetLayout, formatBackupFile, readBackupSets } from '@heynixie/wire';
import type { JobFiles } from './local-job-files';
import type { JobConfig } from './parse-job-config';
import type { BackupRepos } from './publish-backup-set';
import { publishBackupSet } from './publish-backup-set';

export type JobPass =
  | { readonly status: 'ran'; readonly receipts: readonly BackupReceipt[] }
  | { readonly status: 'locked' };

type PassConfig = Pick<JobConfig, 'stagingDir' | 'retention'>;

// Each pass keeps only its own key snapshot, so 2 passes at once could each forget the other's and
// leave the key repo with none. A pass holds the staging lock from its listing to its last receipt,
// and a pass that finds the lock held ships nothing.
export async function runJobPass(
  config: PassConfig,
  repos: BackupRepos,
  files: JobFiles,
): Promise<JobPass> {
  const lockPath = join(config.stagingDir, backupSetLayout.jobLock);

  const isWritten = await files.writeFile(lockPath, '').then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }

      throw error;
    },
  );

  if (!isWritten) {
    return { status: 'ran', receipts: [] };
  }

  const lock = files.claimFileLock(lockPath, 'exclusive');

  if (lock === null) {
    return { status: 'locked' };
  }

  try {
    return { status: 'ran', receipts: await publishStagedSets(config, repos, files) };
  } finally {
    lock.release();
  }
}

// nixie stages one set at a time and writes each one's marker last, so a set with no marker is
// either still copying or one a crash stopped, and the job ships neither. Sets ship in sequence
// order, so the newest key snapshot is always the newest set's.
async function publishStagedSets(
  config: PassConfig,
  repos: BackupRepos,
  files: JobFiles,
): Promise<readonly BackupReceipt[]> {
  const sets = await readBackupSets(files, config.stagingDir);

  const receipts: BackupReceipt[] = [];

  for (const set of sets.filter((entry) => entry.hasMarker && !entry.hasReceipt)) {
    const receipt = await publishBackupSet(repos, config.retention, files, set);

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
