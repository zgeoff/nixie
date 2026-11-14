import { expect, test } from 'bun:test';
import { formatForgetBackup } from './format-forget-backup';

test.each([
  [
    'off',
    { state: 'off' as const },
    'Key backups: off. nixie stages no backup, so a backup copied before the forget still holds the record.',
  ],
  [
    'pending',
    { state: 'pending' as const },
    'Key backups: pending. The next backup job run removes the old key, within the backup interval.',
  ],
  [
    'failed',
    { state: 'failed' as const, failure: 'the storage refused the copy' },
    'Key backups: failed: the storage refused the copy. The next scheduled backup set removes the old key again.',
  ],
  [
    'complete',
    { state: 'complete' as const },
    "Key backups: complete. No key backup holds the record's key.",
  ],
  [
    'unknown',
    { state: 'unknown' as const },
    'Key backups: unknown. nixie could not read the backup state, and the forget still finished.',
  ],
])('it words the %s backup state as one line', (_label, backup, line) => {
  expect(formatForgetBackup(backup)).toBe(line);
});
