import type { ForgetBackupState } from '@heynixie/api';
import { match } from 'ts-pattern';

export function formatForgetBackup(backup: ForgetBackupState): string {
  return match(backup)
    .with(
      { state: 'off' },
      () =>
        'Key backups: off. nixie stages no backup, so a backup copied before the reset still holds the old data.',
    )
    .with(
      { state: 'pending' },
      () =>
        'Key backups: pending. The next backup job run removes the old keys from the key backups, within the backup interval.',
    )
    .with(
      { state: 'failed' },
      (failed) =>
        `Key backups: failed: ${failed.failure}. The next scheduled backup set removes the old keys again.`,
    )
    .with(
      { state: 'complete' },
      () => 'Key backups: complete. No key backup holds a key that the reset removed.',
    )
    .exhaustive();
}
