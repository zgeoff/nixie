import { expect, test } from 'bun:test';
import { collectImportFaults } from './collect-import-faults';

test('it names the package and the import for a dependency that no exception covers', () => {
  const faults = collectImportFaults(
    [{ directory: 'modules/api', importName: '@heynixie/calls' }],
    [],
  );

  expect(faults).toStrictEqual([
    expect.stringMatching(/^modules\/api depends on @heynixie\/calls.*fill a core list/u),
  ]);
});

test('it finds no fault for a dependency that an exception covers', () => {
  const faults = collectImportFaults(
    [{ directory: 'modules/api', importName: '@heynixie/calls' }],
    [{ where: 'modules/api', imports: ['@heynixie/calls'], removedBy: 'GEO-2881' }],
  );

  expect(faults).toStrictEqual([]);
});
