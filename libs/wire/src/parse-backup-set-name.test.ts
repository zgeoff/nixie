import { expect, test } from 'bun:test';
import { parseBackupSetName } from './parse-backup-set-name';

test.each([
  ['000000000042', 42],
  ['000000000001', 1],
])('it reads the set directory %s as sequence %d', (name, sequence) => {
  expect(parseBackupSetName(name)).toBe(sequence);
});

test.each([
  ['a name with too few digits', '42'],
  ['sequence zero', '000000000000'],
  ['a hidden temporary name', '.000000000042'],
  ['a name with a letter', '00000000004a'],
])('it reads %s as no set', (_label, name) => {
  expect(parseBackupSetName(name)).toBeNull();
});
