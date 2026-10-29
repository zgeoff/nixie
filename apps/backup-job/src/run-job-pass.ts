import { open, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupReceipt } from '@heynixie/wire';
import { backupSetFiles, backupSetLayout, formatBackupFile, readBackupSets } from '@heynixie/wire';
import type { JobConfig } from './parse-job-config';
import type { BackupRepos } from './publish-backup-set';
import { publishBackupSet } from './publish-backup-set';

// nixie stages one set at a time and writes each one's marker last, so a set with no marker is
// either still copying or one a crash stopped, and the job ships neither. Sets ship in sequence
// order, so the newest key snapshot is always the newest set's.
export async function runJobPass(
  config: Pick<JobConfig, 'stagingDir' | 'retention'>,
  repos: BackupRepos,
): Promise<readonly BackupReceipt[]> {
  const sets = await readBackupSets(config.stagingDir);

  const receipts: BackupReceipt[] = [];

  for (const set of sets.filter((entry) => entry.hasMarker && !entry.hasReceipt)) {
    const receipt = await publishBackupSet(repos, config.retention, set);

    await writeReceipt(set.directory, receipt);
    await removeCopies(set.directory);

    receipts.push(receipt);
  }

  return receipts;
}

async function writeReceipt(directory: string, receipt: BackupReceipt): Promise<void> {
  const path = join(directory, backupSetLayout.receipt);
  const partial = `${path}.partial`;

  await writeFile(partial, formatBackupFile(receipt));
  await writeToDisk(partial);
  await rename(partial, path);
  await writeToDisk(directory);
}

async function writeToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeCopies(directory: string): Promise<void> {
  for (const file of backupSetFiles) {
    await rm(join(directory, file), { force: true });
  }

  await writeToDisk(directory);
}
