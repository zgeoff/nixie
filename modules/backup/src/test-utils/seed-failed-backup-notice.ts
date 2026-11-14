import invariant from 'tiny-invariant';
import { writeBackupNotices } from '../backup/write-backup-notices';
import { writeReceivedReceipts } from '../backup/write-received-receipts';
import { writeSnapshotSet } from '../backup/write-snapshot-set';
import type { BackupContext, BackupNotice } from '../types';
import { writeTestBackupReceipt } from './write-test-backup-receipt';

export interface FailedBackupNoticeInput {
  readonly failure: string;
}

export async function seedFailedBackupNotice(
  context: BackupContext,
  input: FailedBackupNoticeInput,
): Promise<BackupNotice> {
  const staged = await writeSnapshotSet(context, 'scheduled');

  invariant(staged, 'a backup set stages when nixie is not paused after a restore');

  await writeTestBackupReceipt(context.writer.dataDir, {
    sequence: staged.sequence,
    status: 'failed',
    failure: input.failure,
  });

  await writeReceivedReceipts(context);

  const [notice] = await writeBackupNotices(context, 3_600_000);

  invariant(notice?.cause === 'failed', 'a failed receipt raises a failed notice');

  return notice;
}
