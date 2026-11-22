import { expect, test } from 'bun:test';
import { cutResultLists } from './cut-result-lists';

test('it leaves a result that fits as it is', () => {
  const result = { entries: ['a', 'b'], total: 2 };

  expect(cutResultLists(result, ['entries'], 1000)).toStrictEqual(result);
});

test('it drops entries from the end of the longest list until the result fits', () => {
  const result = {
    first: ['x'.repeat(30), 'y'.repeat(30), 'z'.repeat(30)],
    second: ['q'],
    total: 4,
  };

  const cut = cutResultLists(result, ['first', 'second'], 130);

  expect(cut).toStrictEqual({ first: ['x'.repeat(30), 'y'.repeat(30)], second: ['q'], total: 4 });
});

test('it stops when every list is empty', () => {
  expect(cutResultLists({ entries: ['x'.repeat(50)] }, ['entries'], 10)).toStrictEqual({
    entries: [],
  });
});
