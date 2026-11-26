import { expect, test } from 'bun:test';
import { createShortID } from '@heynixie/db';
import { startShortIDDraws } from './start-short-id-draws';

test('it gives the listed short IDs in order', () => {
  startShortIDDraws(['one', 'two']);

  expect([createShortID(), createShortID()]).toStrictEqual(['one', 'two']);
});

test('it fails a draw past the list', () => {
  startShortIDDraws(['one']);
  createShortID();

  expect(() => createShortID()).toThrow('past the test draws');
});
