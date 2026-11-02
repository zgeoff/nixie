import { backupSetLayout } from './backup-set-layout';

const setNamePattern = new RegExp(`^[0-9]{${String(backupSetLayout.sequenceDigits)}}$`, 'u');

export function parseBackupSetName(name: string): number | null {
  if (!setNamePattern.test(name)) {
    return null;
  }

  const sequence = Number(name);

  return sequence > 0 ? sequence : null;
}
