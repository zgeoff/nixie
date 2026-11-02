import type { BackupReceipt } from './backup-receipt';
import type { BackupSetManifest } from './backup-set-manifest';

export function formatBackupFile(value: BackupSetManifest | BackupReceipt): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
