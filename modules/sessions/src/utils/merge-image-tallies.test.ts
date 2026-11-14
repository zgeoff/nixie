import { expect, test } from 'bun:test';
import { mergeImageTallies } from './merge-image-tallies';

test('it adds the bytes and the count of every tally', () => {
  expect(
    mergeImageTallies({ bytes: 12, count: 2 }, { bytes: 8, count: 1 }, { bytes: 0, count: 0 }),
  ).toStrictEqual({ bytes: 20, count: 3 });
});

test('it merges no tallies to no images', () => {
  expect(mergeImageTallies()).toStrictEqual({ bytes: 0, count: 0 });
});
