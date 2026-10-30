import { expect, test } from 'bun:test';
import { trimOldest } from './trim-oldest.ts';

test('it removes the oldest map entries past the limit', () => {
  const map = new Map([
    ['first', 1],
    ['second', 2],
    ['third', 3],
  ]);

  trimOldest(map, 2);

  expect([...map.keys()]).toStrictEqual(['second', 'third']);
});

test('it leaves a set within the limit alone', () => {
  const set = new Set(['first', 'second']);

  trimOldest(set, 2);

  expect([...set]).toStrictEqual(['first', 'second']);
});
