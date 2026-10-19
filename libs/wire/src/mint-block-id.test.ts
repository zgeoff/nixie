import { expect, test } from 'bun:test';
import { mintBlockID } from './mint-block-id';

test('it mints 12 hex characters', () => {
  expect(mintBlockID()).toMatch(/^[\da-f]{12}$/u);
});

test('it mints a fresh ID on each call', () => {
  expect(mintBlockID()).not.toBe(mintBlockID());
});
