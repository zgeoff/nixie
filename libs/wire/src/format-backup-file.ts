import type { BackupReceipt } from './backup-receipt';
import type { BackupSetManifest } from './backup-set-manifest';
import type { FetchedPair } from './fetched-pair';
import type { RestoreNote } from './restore-note';

export function formatBackupFile(
  value: BackupSetManifest | BackupReceipt | RestoreNote | FetchedPair,
): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
