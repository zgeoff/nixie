import { expect, test } from 'bun:test';
import { collectStaleNameExceptions } from './collect-stale-name-exceptions';

test('it finds a name exception that matches nothing', () => {
  const stale = collectStaleNameExceptions(
    [],
    [{ where: 'modules/api', names: ['google'], removedBy: 'GEO-2879' }],
  );

  expect(stale).toStrictEqual([
    'the exception for google in modules/api matches nothing. Delete it.',
  ]);
});

test('it finds no stale name exception while the name is held', () => {
  const stale = collectStaleNameExceptions(
    [{ file: 'modules/api/src/a.ts', name: 'google' }],
    [{ where: 'modules/api', names: ['google'], removedBy: 'GEO-2879' }],
  );

  expect(stale).toStrictEqual([]);
});
