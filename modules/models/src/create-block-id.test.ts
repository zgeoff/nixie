import { expect, test } from 'bun:test';
import { createBlockID } from './create-block-id';

test('it creates 12 hex characters', () => {
  expect(createBlockID()).toMatch(/^[\da-f]{12}$/u);
});

test('it creates a fresh ID on each call', () => {
  expect(createBlockID()).not.toBe(createBlockID());
});
