import { expect, onTestFinished, test } from 'bun:test';
import { isCuid } from '@paralleldrive/cuid2';
import { createShortID, setShortIDDrawer } from './create-short-id';

test('it makes a 10-character cuid2', () => {
  const id = createShortID();

  expect(id).toHaveLength(10);
  expect(isCuid(id, { minLength: 10, maxLength: 10 })).toBeTrue();
});

test('it makes a different ID at each call', () => {
  expect(createShortID()).not.toBe(createShortID());
});

test('it makes the IDs that a test drawer gives until the test ends', () => {
  const draws = ['first-draw', 'second-draw'];

  setShortIDDrawer(() => draws.shift() ?? 'none');

  onTestFinished(() => {
    setShortIDDrawer(null);
  });

  expect([createShortID(), createShortID()]).toStrictEqual(['first-draw', 'second-draw']);
});
