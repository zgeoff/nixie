import { expect, test } from 'bun:test';
import { buildActionHash } from './build-action-hash';

test('it builds a sha256 hash of the tool and its arguments', () => {
  expect(buildActionHash('test.send', { to: 'team' })).toMatch(/^sha256:[\da-f]{64}$/u);
});

test('it builds the same hash for the same arguments in another key order', () => {
  expect(buildActionHash('test.send', { to: 'team', body: { text: 'hi', tags: ['a', 'b'] } })).toBe(
    buildActionHash('test.send', { body: { tags: ['a', 'b'], text: 'hi' }, to: 'team' }),
  );
});

test('it builds another hash for other arguments', () => {
  expect(buildActionHash('test.send', { to: 'team' })).not.toBe(
    buildActionHash('test.send', { to: 'family' }),
  );
});

test('it builds another hash for another tool with the same arguments', () => {
  expect(buildActionHash('test.send', { to: 'team' })).not.toBe(
    buildActionHash('mail.send', { to: 'team' }),
  );
});

test('it builds another hash when array items change order', () => {
  expect(buildActionHash('test.send', { to: ['a', 'b'] })).not.toBe(
    buildActionHash('test.send', { to: ['b', 'a'] }),
  );
});
