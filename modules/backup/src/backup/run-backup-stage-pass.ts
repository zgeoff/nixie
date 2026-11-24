import type { BackupSetManifest } from '@heynixie/wire';
import type { BackupContext } from '../types';
import { pickBackupStage } from './pick-backup-stage';
import { readBackupDue } from './read-backup-due';
import { readHeldBackupSet } from './read-held-backup-set';
import type { BackupPass } from './run-backup-pass';
import { runBackupPassWith } from './run-backup-pass';
import { writeSnapshotSet } from './write-snapshot-set';

export type BackupStageOutcome =
  | { readonly status: 'staged'; readonly manifest: BackupSetManifest }
  | { readonly status: 'set_waiting'; readonly sequence: number }
  | { readonly status: 'restore_pause' };

export interface BackupStagePass {
  readonly pass: BackupPass;
  readonly outcome: BackupStageOutcome;
}

// The pass records the job's receipts before it looks for a waiting set, because a set that the job
// shipped a moment ago still reads as staged until its receipt is recorded.
export async function runBackupStagePass(
  context: BackupContext,
  intervalMs: number,
): Promise<BackupStagePass> {
  const result: { outcome: BackupStageOutcome } = { outcome: { status: 'restore_pause' } };

  const pass = await runBackupPassWith(context, intervalMs, async () => {
    const due = await readBackupDue(context.writer, context.legacyEnds ?? []);
    const held = await readHeldBackupSet(context.writer);

    const pick = pickBackupStage(due, held);

    if (pick.status === 'set_waiting') {
      result.outcome = pick;

      return null;
    }

    const manifest = await writeSnapshotSet(context, pick.kind);

    if (manifest !== null) {
      result.outcome = { status: 'staged', manifest };
    }

    return manifest;
  });

  return { pass, outcome: result.outcome };
}
