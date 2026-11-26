import { expect, test } from 'bun:test';
import { collectImportLeaks } from './collect-import-leaks';

test('it finds the feature modules that a core module depends on', () => {
  const leaks = collectImportLeaks([
    {
      directory: 'modules/sessions',
      name: '@heynixie/sessions',
      tags: ['leaking'],
      dependsOn: ['@heynixie/calls', '@heynixie/log'],
    },
    { directory: 'modules/calls', name: '@heynixie/calls', tags: ['feature'], dependsOn: [] },
    { directory: 'modules/log', name: '@heynixie/log', tags: ['core'], dependsOn: [] },
  ]);

  expect(leaks).toStrictEqual([{ directory: 'modules/sessions', importName: '@heynixie/calls' }]);
});
