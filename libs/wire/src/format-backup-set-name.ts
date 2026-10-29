import { backupSetLayout } from './backup-set-layout';

export function formatBackupSetName(sequence: number): string {
  return String(sequence).padStart(backupSetLayout.sequenceDigits, '0');
}
