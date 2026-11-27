import { expect, test } from 'bun:test';
import { collectStaleImportExceptions } from './collect-stale-import-exceptions';

test('it finds an import exception that matches nothing', () => {
  const stale = collectStaleImportExceptions(
    [],
    [{ where: 'modules/api', imports: ['@heynixie/calls'], removedBy: 'GEO-2881' }],
  );

  expect(stale).toStrictEqual([
    'the exception for @heynixie/calls in modules/api matches nothing. Delete it.',
  ]);
});
