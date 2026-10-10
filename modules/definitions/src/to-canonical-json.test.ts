import { expect, test } from 'bun:test';
import { toCanonicalJSON } from './to-canonical-json';

test('it sorts the keys of every object, nested ones included', () => {
  expect(toCanonicalJSON({ b: 1, a: { d: [{ f: 1, e: 2 }], c: null } })).toBe(
    '{"a":{"c":null,"d":[{"e":2,"f":1}]},"b":1}',
  );
});

test('it gives the same text for the same object built in any key order', () => {
  expect(toCanonicalJSON({ name: 'web_fetch', effects: ['fetch'] })).toBe(
    toCanonicalJSON({ effects: ['fetch'], name: 'web_fetch' }),
  );
});

test('it keeps the order of array items', () => {
  expect(toCanonicalJSON(['b', 'a'])).toBe('["b","a"]');
});

test('it writes no whitespace between tokens', () => {
  expect(toCanonicalJSON({ text: 'a b', list: [1, 2] })).toBe('{"list":[1,2],"text":"a b"}');
});

test('it refuses a number JSON cannot hold', () => {
  expect(() => toCanonicalJSON({ limit: Number.POSITIVE_INFINITY })).toThrowWithMessage(
    TypeError,
    'canonical JSON has no form for Infinity',
  );
});
