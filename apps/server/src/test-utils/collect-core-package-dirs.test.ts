import { expect, test } from 'bun:test';
import { collectCorePackageDirs } from './collect-core-package-dirs';

test('it takes each module that is not a feature, and the contract, as core', () => {
  const dirs = collectCorePackageDirs([
    { directory: 'modules/sessions', name: '@heynixie/sessions', tags: ['leaking'], dependsOn: [] },
    { directory: 'modules/calls', name: '@heynixie/calls', tags: ['feature'], dependsOn: [] },
    { directory: 'modules/log', name: '@heynixie/log', tags: ['core'], dependsOn: [] },
  ]);

  expect(dirs).toStrictEqual(['modules/sessions', 'modules/log', 'libs/contract']);
});
