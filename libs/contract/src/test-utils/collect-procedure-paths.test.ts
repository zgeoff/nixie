import { expect, test } from 'bun:test';
import { collectProcedurePaths } from './collect-procedure-paths';

test('it collects the path of each procedure of a nested router', () => {
  const router = { garden: { water: { '~orpc': {} }, beds: { list: { '~orpc': {} } } } };

  expect(collectProcedurePaths(router.garden, ['garden'])).toStrictEqual([
    ['garden', 'water'],
    ['garden', 'beds', 'list'],
  ]);
});
