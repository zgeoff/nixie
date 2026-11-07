import type { BackupSetManifest } from '@heynixie/wire';
import { BackupPassError } from './backup-pass-error';
import { pickBackupSetKind } from './pick-backup-set-kind';
import { readBackupDue } from './read-backup-due';
import type { BackupHealth } from './read-backup-health';
import { readBackupHealth } from './read-backup-health';
import type { BackupContext, BackupNotice, BackupWriter } from './types';
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

  const outputs: { noticed: readonly BackupNotice[]; staged: BackupSetManifest | null } = {
    noticed: [],
    staged: null,
  };

  try {
    outputs.noticed = await writeBackupNotices(context, intervalMs);

    const due = await readBackupDue(context.writer);

    const kind = pickBackupSetKind(due, context.writer.clock.now(), intervalMs);

    outputs.staged = kind === null ? null : await writeSnapshotSet(context, kind);
  } catch (error) {
    const healthAfterError = await readHealthOrError(context.writer);

    throw 'error' in healthAfterError
      ? new BackupPassError({ received, ...outputs, health: null }, [error, healthAfterError.error])
      : new BackupPassError({ received, ...outputs, health: healthAfterError.health }, [error]);
  }

  const healthAtEnd = await readHealthOrError(context.writer);

  if ('error' in healthAtEnd) {
    throw new BackupPassError({ received, ...outputs, health: null }, [healthAtEnd.error]);
  }

  return { received, ...outputs, health: healthAtEnd.health };
}

type HealthOrError = { readonly health: BackupHealth } | { readonly error: unknown };

async function readHealthOrError(writer: Pick<BackupWriter, 'db'>): Promise<HealthOrError> {
  try {
    return { health: await readBackupHealth(writer) };
  } catch (error) {
    return { error };
  }
}
