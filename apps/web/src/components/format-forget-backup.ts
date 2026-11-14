import { match } from 'ts-pattern';
import type { ForgetBackup } from '../types';

export function formatForgetBackup(backup: ForgetBackup): string {
  return match(backup)
    .with(
      { state: 'off' },
      () =>
        'Key backups: off. nixie stages no backup, so a backup copied before the forget still holds the record.',
    )
    .with(
      { state: 'pending' },
      () =>
        'Key backups: pending. The next backup job run removes the old key, within the backup interval.',
    )
    .with(
      { state: 'failed' },
      (failed) =>
        `Key backups: failed: ${failed.failure}. The next scheduled backup set removes the old key again.`,
    )
    .with(
      { state: 'complete' },
      () => "Key backups: complete. No key backup holds the record's key.",
    )
    .with(
      { state: 'unknown' },
      () =>
        'Key backups: unknown. nixie could not read the backup state, and the forget still finished.',
    )
    .exhaustive();
}
