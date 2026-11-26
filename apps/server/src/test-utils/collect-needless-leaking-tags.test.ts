import { expect, test } from 'bun:test';
import { collectNeedlessLeakingTags } from './collect-needless-leaking-tags';

test('it finds a module tagged leaking that depends on no feature and no leaking module', () => {
  const found = collectNeedlessLeakingTags([
    { directory: 'modules/calls', name: '@heynixie/calls', tags: ['feature'], dependsOn: [] },
    { directory: 'modules/log', name: '@heynixie/log', tags: ['core'], dependsOn: [] },
    {
      directory: 'modules/ops',
      name: '@heynixie/ops',
      tags: ['leaking'],
      dependsOn: ['@heynixie/log'],
    },
    {
      directory: 'modules/sessions',
      name: '@heynixie/sessions',
      tags: ['leaking'],
      dependsOn: ['@heynixie/calls'],
    },
  ]);

  expect(found).toStrictEqual(['modules/ops']);
});
