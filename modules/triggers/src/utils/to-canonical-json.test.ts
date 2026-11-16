import { expect, test } from 'bun:test';
import { toCanonicalJSON } from './to-canonical-json';

test('it sorts keys and leaves out whitespace', () => {
  const value = { beta: [1, { delta: null, gamma: 'x' }], alpha: true };

  expect(toCanonicalJSON(value)).toBe('{"alpha":true,"beta":[1,{"delta":null,"gamma":"x"}]}');
});

test('it leaves out an undefined member', () => {
  expect(toCanonicalJSON({ alpha: 1, beta: undefined })).toBe('{"alpha":1}');
});

test('it gives one text for 2 objects that differ only in key order', () => {
  expect(toCanonicalJSON({ first: 1, second: 2 })).toBe(toCanonicalJSON({ second: 2, first: 1 }));
});
