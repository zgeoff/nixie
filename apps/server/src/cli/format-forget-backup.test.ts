import { expect, test } from 'bun:test';
import { formatForgetBackup } from './format-forget-backup';

test.each([
  [
    'off',
    { state: 'off' },
    'Key backups: off. nixie stages no backup, so a backup copied before the reset still holds the old data.',
  ],
  [
    'pending',
    { state: 'pending' },
    'Key backups: pending. The next backup job run removes the old keys from the key backups, within the backup interval.',
  ],
  [
    'failed',
    { state: 'failed', failure: 'keys: prune exited 1' },
    'Key backups: failed: keys: prune exited 1. The next scheduled backup set removes the old keys again.',
  ],
  [
    'complete',
    { state: 'complete' },
    'Key backups: complete. No key backup holds a key that the reset removed.',
  ],
  [
    'unknown',
    { state: 'unknown' },
    'Key backups: unknown. nixie could not read the backup state, and the server log holds the error.',
  ],
] as const)('it formats the %s key backup state', (_label, backup, line) => {
  expect(formatForgetBackup(backup)).toBe(line);
});
