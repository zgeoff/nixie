import invariant from 'tiny-invariant';
import { writeReceivedReceipts } from '../backup/write-received-receipts';
import { writeSnapshotSet } from '../backup/write-snapshot-set';
import type { BackupContext } from '../types';
import { writeTestBackupReceipt } from './write-test-backup-receipt';

// Stages a scheduled set, then records the receipt that the job writes for it, so the set reads as
// published.
export async function seedPublishedBackupSet(context: BackupContext): Promise<number> {
  const staged = await writeSnapshotSet(context, 'scheduled');

  invariant(staged, 'a backup set stages when nixie is not paused after a restore');

  await writeTestBackupReceipt(context.writer.dataDir, {
    sequence: staged.sequence,
    status: 'published',
  });

  await writeReceivedReceipts(context);

  return staged.sequence;
}
