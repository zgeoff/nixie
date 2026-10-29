import type { BackupSetManifest } from '@heynixie/wire';
import { pickBackupSetKind } from './pick-backup-set-kind';
import { readBackupDue } from './read-backup-due';
import type { BackupContext } from './types';
import type { ReceivedReceipt } from './write-received-receipts';
import { writeReceivedReceipts } from './write-received-receipts';
import { writeSnapshotSet } from './write-snapshot-set';

export interface BackupPass {
  readonly received: readonly ReceivedReceipt[];
  readonly staged: BackupSetManifest | null;
}

export async function runBackupPass(
  context: BackupContext,
  intervalMs: number,
): Promise<BackupPass> {
  const received = await writeReceivedReceipts(context);
  const due = await readBackupDue(context.writer);

  const kind = pickBackupSetKind(due, context.writer.clock.now(), intervalMs);

  return { received, staged: kind === null ? null : await writeSnapshotSet(context, kind) };
}
