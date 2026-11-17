import { expect, test } from 'bun:test';
import { isBeforeTurnFailure } from './is-before-turn-failure';
import { markBeforeTurnFailure } from './mark-before-turn-failure';

test('it finds the error that a step marked, and no other', () => {
  const marked = new Error('the call failed');
  const other = new Error('the model failed');

  markBeforeTurnFailure(marked);

  expect([isBeforeTurnFailure(marked), isBeforeTurnFailure(other)]).toStrictEqual([true, false]);
});

test('it marks nothing that is not an object, and finds nothing there', () => {
  markBeforeTurnFailure('a string');

  expect(isBeforeTurnFailure('a string')).toBe(false);
});
