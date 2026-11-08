import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupReceipt } from '@heynixie/wire';
import { backupSetLayout, formatBackupFile, getBackupSetDir } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { getBackupStagingDir } from '../get-backup-staging-dir';

export type TestBackupReceipt =
  | { readonly sequence: number; readonly status: 'published' }
  | { readonly sequence: number; readonly status: 'failed'; readonly failure: string };

// The backup job writes each receipt from its own process after restic runs, so a test of nixie's
// side writes the receipt the job would write into the set's folder.
export async function writeTestBackupReceipt(
  dataDir: string,
  receipt: TestBackupReceipt,
): Promise<void> {
  const directory = getBackupSetDir(getBackupStagingDir(dataDir), receipt.sequence);

  const written = match(receipt)
    .returnType<BackupReceipt>()
    .with({ status: 'published' }, (published) => ({
      format: 1,
      sequence: published.sequence,
      writtenAt: 1_798_761_660_000,
      status: 'published',
      dataSnapshotID: 'a'.repeat(64),
      keySnapshotID: 'b'.repeat(64),
      removedKeySnapshotIDs: [],
      prune: 'passed',
      check: 'passed',
      failure: null,
    }))
    .with({ status: 'failed' }, (failed) => ({
      format: 1,
      sequence: failed.sequence,
      writtenAt: 1_798_761_660_000,
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      removedKeySnapshotIDs: [],
      prune: 'failed',
      check: 'not-run',
      failure: failed.failure,
    }))
    .exhaustive();

  await writeFile(join(directory, backupSetLayout.receipt), formatBackupFile(written));
}
