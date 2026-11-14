import { expect, test } from 'bun:test';
import { buildKey } from './build-key';

test.each([
  ['hex', /^[a-f0-9]{40}$/u],
  ['digits', /^\d{40}$/u],
  ['base32', /^[A-Z2-7]{40}$/u],
  ['lowercaseAlphanumeric', /^[a-z0-9]{40}$/u],
  ['alphanumeric', /^[a-zA-Z0-9]{40}$/u],
] as const)('it builds a %s key of the length asked for', (kind, pattern) => {
  expect(buildKey(kind, 40)).toMatch(pattern);
});

test('it builds the same key from the same arguments', () => {
  expect(buildKey('hex', 30, 7)).toBe(buildKey('hex', 30, 7));
});

test('it builds a different key from a different seed', () => {
  expect(buildKey('hex', 30, 1)).not.toBe(buildKey('hex', 30, 2));
});

test('it uses every character of a small alphabet in a long key', () => {
  expect(new Set(buildKey('digits', 300)).size).toBe(10);
});
