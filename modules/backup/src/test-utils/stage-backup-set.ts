import type { BackupSetKind, BackupSetManifest } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { BackupPassError } from '../backup/backup-pass-error';
import { runBackupStagePass } from '../backup/run-backup-stage-pass';
import { writeSnapshotSet } from '../backup/write-snapshot-set';
import type { BackupContext } from '../types';

export type BackupSetEntryPoint = 'writeSnapshotSet' | 'the stage pass';

// The stage pass picks its own kind, so `kind` binds only writeSnapshotSet. The stage pass wraps a
// failure in a BackupPassError, which this unwraps, so a test checks one failure through either entry
// point.
export function stageBackupSet(
  entryPoint: BackupSetEntryPoint,
  context: BackupContext,
  kind: BackupSetKind,
): Promise<BackupSetManifest | null> {
  return match(entryPoint)
    .with('writeSnapshotSet', () => writeSnapshotSet(context, kind))
    .with('the stage pass', async () => {
      const staged = await runBackupStagePass(context, 3_600_000).catch((error: unknown) => {
        throw error instanceof BackupPassError ? error.failures[0] : error;
      });

      return staged.outcome.status === 'staged' ? staged.outcome.manifest : null;
    })
    .exhaustive();
}
