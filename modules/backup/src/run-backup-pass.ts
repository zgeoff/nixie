import type { BackupSetManifest } from '@heynixie/wire';
import { BackupPassError } from './backup-pass-error';
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
  readonly health: BackupHealth | null;
}

// The pass removes each recorded receipt's set folder, so a failure after that throws the receipts
// with it, or their refusals and failures would never reach the log.
export async function runBackupPass(
  context: BackupContext,
  intervalMs: number,
): Promise<BackupPass> {
  const received = await writeReceivedReceipts(context);

  const done: { noticed: readonly BackupNotice[]; staged: BackupSetManifest | null } = {
    noticed: [],
    staged: null,
  };

  try {
    done.noticed = await writeBackupNotices(context, intervalMs);

    const due = await readBackupDue(context.writer);

    const kind = pickBackupSetKind(due, context.writer.clock.now(), intervalMs);

    done.staged = kind === null ? null : await writeSnapshotSet(context, kind);

    return { received, ...done, health: await readBackupHealth(context.writer) };
  } catch (error) {
    const read = await readBackupHealth(context.writer).then(
      (health) => ({ health, failures: [error] as const }),
      (readError: unknown) => ({ health: null, failures: [error, readError] as const }),
    );

    throw new BackupPassError({ received, ...done, health: read.health }, read.failures);
  }
}
