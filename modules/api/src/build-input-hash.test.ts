import { expect, test } from 'bun:test';
import { buildInputHash } from './build-input-hash';

test('it builds the same hash whatever order the fields come in', () => {
  expect(buildInputHash({ sessionID: 's-1', clientActionID: 'a-1' })).toBe(
    buildInputHash({ clientActionID: 'a-1', sessionID: 's-1' }),
  );
});

test('it builds another hash for another input', () => {
  expect(buildInputHash({ sessionID: 's-1' })).not.toBe(buildInputHash({ sessionID: 's-2' }));
});

test('it builds a SHA-256 hash in hex', () => {
  expect(buildInputHash({ sessionID: 's-1' })).toMatch(/^[0-9a-f]{64}$/u);
});
