import { expect, test } from 'bun:test';
import { readQueryKeyAt } from './read-query-key-at';

test('it reads the key of the node at a path', () => {
  const utils = { beds: { list: { key: () => [['nixie', 'beds', 'list']] } } };

  expect(readQueryKeyAt(utils, ['beds', 'list'])).toStrictEqual([['nixie', 'beds', 'list']]);
});
