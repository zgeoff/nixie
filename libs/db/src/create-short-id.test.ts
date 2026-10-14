import { expect, test } from 'bun:test';
import { isCuid } from '@paralleldrive/cuid2';
import { createShortID } from './create-short-id';

test('it makes a 10-character cuid2', () => {
  const id = createShortID();

  expect(id).toHaveLength(10);
  expect(isCuid(id, { minLength: 10, maxLength: 10 })).toBeTrue();
});

test('it makes a different ID at each call', () => {
  expect(createShortID()).not.toBe(createShortID());
});
