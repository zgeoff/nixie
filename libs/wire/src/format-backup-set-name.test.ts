import { expect, test } from 'bun:test';
import { formatBackupSetName } from './format-backup-set-name';
import { parseBackupSetName } from './parse-backup-set-name';

test('it names a set by its sequence, padded so names sort in sequence order', () => {
  expect([formatBackupSetName(10), formatBackupSetName(9)].toSorted()).toStrictEqual([
    '000000000009',
    '000000000010',
  ]);
});

test('it writes a name that the set name parser reads back', () => {
  expect(parseBackupSetName(formatBackupSetName(123_456))).toBe(123_456);
});
