import { expect, test } from 'bun:test';
import { buildInputHash } from './build-input-hash';

test('it builds the frozen hash of a known input', () => {
  expect(buildInputHash({ sessionID: 's-1', clientActionID: 'a-1' })).toMatchInlineSnapshot(
    `"52c4b35e13623f4922ae1cfd265a43160c0ec57cf40e689b6ab30c4822e7bcdc"`,
  );
});

test('it builds the same hash for the same input', () => {
  expect(buildInputHash({ sessionID: 's-1', clientActionID: 'a-1' })).toBe(
    buildInputHash({ sessionID: 's-1', clientActionID: 'a-1' }),
  );
});

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
