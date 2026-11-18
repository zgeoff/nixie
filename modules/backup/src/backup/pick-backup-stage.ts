import type { BackupSetKind } from '@heynixie/wire';
import type { BackupDue } from './read-backup-due';

export type BackupStagePick =
  | { readonly status: 'stage'; readonly kind: BackupSetKind }
  | { readonly status: 'set_waiting'; readonly sequence: number };

// The command stages the kind that the regular pass would pick, but at once, and never beside a set
// the job has not shipped.
export function pickBackupStage(due: BackupDue, heldSequence: number | null): BackupStagePick {
  if (heldSequence !== null) {
    return { status: 'set_waiting', sequence: heldSequence };
  }

  return { status: 'stage', kind: due.isForgetDue ? 'forget' : 'scheduled' };
}
