import type { BackupSetManifest } from '@heynixie/wire';
import { pickBackupSetKind } from './pick-backup-set-kind';
import { readBackupDue } from './read-backup-due';
import type { BackupHealth } from './read-backup-health';
import { readBackupHealth } from './read-backup-health';
import type { BackupContext, BackupNotice } from './types';
import { writeBackupNotices } from './write-backup-notices';
import type { ReceivedReceipt } from './write-received-receipts';
import { writeReceivedReceipts } from './write-received-receipts';
import { writeSnapshotSet } from './write-snapshot-set';

export interface BackupPass {
  readonly received: readonly ReceivedReceipt[];
  readonly staged: BackupSetManifest | null;
  readonly noticed: readonly BackupNotice[];
  readonly health: BackupHealth;
}

export async function runBackupPass(
  context: BackupContext,
  intervalMs: number,
): Promise<BackupPass> {
  const received = await writeReceivedReceipts(context);
  const noticed = await writeBackupNotices(context, intervalMs);
  const due = await readBackupDue(context.writer);

  const kind = pickBackupSetKind(due, context.writer.clock.now(), intervalMs);
  const staged = kind === null ? null : await writeSnapshotSet(context, kind);

  return { received, noticed, staged, health: await readBackupHealth(context.writer) };
}
