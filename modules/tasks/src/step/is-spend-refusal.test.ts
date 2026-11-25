import { expect, test } from 'bun:test';
import { isSpendRefusal } from './is-spend-refusal';
import { markSpendRefusal } from './mark-spend-refusal';

test('it finds the error that a step marked as a refusal, and no other', () => {
  const marked = new Error('the route is at its limit');
  const other = new Error('the model failed');

  markSpendRefusal(marked);

  expect([isSpendRefusal(marked), isSpendRefusal(other)]).toStrictEqual([true, false]);
});

test('it marks nothing that is not an object, and finds nothing there', () => {
  markSpendRefusal('a string');

  expect(isSpendRefusal('a string')).toBe(false);
});
