import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from './build-short-id-from-uuid';

test('it gives a UUID the same short ID it gave at the release', () => {
  expect(buildShortIDFromUUID('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13')).toMatchInlineSnapshot(
    `"as2nducz6x"`,
  );
});

test('it gives the same short ID each time it reads a UUID', () => {
  expect(buildShortIDFromUUID('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94')).toBe(
    buildShortIDFromUUID('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94'),
  );
});

test('it gives 2 UUIDs different short IDs', () => {
  expect(buildShortIDFromUUID('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13')).not.toBe(
    buildShortIDFromUUID('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94'),
  );
});

test('it gives a short ID in the shape of a new one: a letter, then 9 letters and digits', () => {
  expect(buildShortIDFromUUID('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94')).toMatch(
    /^[a-z][a-z0-9]{9}$/u,
  );
});
