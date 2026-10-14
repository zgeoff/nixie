import { expect, test } from 'bun:test';
import { getItemShortID } from './get-item-short-id';

test('it gives the short ID an item holds', () => {
  expect(
    getItemShortID({ item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: 'k3x9m2p7qa' }),
  ).toBe('k3x9m2p7qa');
});

test('it gives an item that holds no short ID the one its UUID gives', () => {
  expect(getItemShortID({ item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: null })).toBe(
    'as2nducz6x',
  );
});
