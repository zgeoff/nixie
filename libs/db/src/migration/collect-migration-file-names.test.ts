import { expect, test } from 'bun:test';
import { collectMigrationFileNames } from './collect-migration-file-names';

test('it keeps each source file, in name order, and drops tests and other files', () => {
  expect(
    collectMigrationFileNames([
      '0002-b.ts',
      '0001-a.test.ts',
      'notes.md',
      '0001-a.ts',
      'helper.ts',
      '0002-b.test.ts',
    ]),
  ).toStrictEqual(['0001-a.ts', '0002-b.ts', 'helper.ts']);
});
