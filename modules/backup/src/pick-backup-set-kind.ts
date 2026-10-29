import type { BackupSetKind } from '@heynixie/wire';
import type { BackupDue } from './read-backup-due';

// A forget stages at once, even beside a set that waits, because only a newer key snapshot takes
// the forgotten key out of the key repo. A scheduled set waits for the one before it to ship, so
// a deployment whose job is down keeps one set on the volume, not one per interval.
export function pickBackupSetKind(
  due: BackupDue,
  now: number,
  intervalMs: number,
): BackupSetKind | null {
  if (due.isForgetDue) {
    return 'forget';
  }

  if (due.isSetWaiting) {
    return null;
  }

  if (due.newestStagedAt === null || now - due.newestStagedAt >= intervalMs) {
    return 'scheduled';
  }

  return null;
}
