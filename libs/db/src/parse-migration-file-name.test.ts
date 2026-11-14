import { expect, test } from 'bun:test';
import { parseMigrationFileName } from './parse-migration-file-name';

test.each([
  { fileName: '0001-event-log-migration.ts', number: 1 },
  { fileName: '0041-add-a-thing.ts', number: 41 },
  { fileName: '0100-big.ts', number: 100 },
])('it reads the number of $fileName', (row) => {
  expect(parseMigrationFileName(row.fileName)).toBe(row.number);
});

test.each([
  '1-short.ts',
  '00001-long.ts',
  '0001.ts',
  '0001-Upper.ts',
  '0001-thing.js',
  '0001-thing.test.ts',
  'helper.ts',
])('it returns null for %s', (fileName) => {
  expect(parseMigrationFileName(fileName)).toBeNull();
});
