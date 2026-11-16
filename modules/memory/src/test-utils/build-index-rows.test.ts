import { expect, test } from 'bun:test';
import { buildIndexRows } from './build-index-rows';

test('it builds the rows of one topic with rising sequences from the first one', () => {
  expect(buildIndexRows('home', 2, 5)).toStrictEqual([
    {
      itemID: '00000000-0000-4000-8000-000000000005',
      shortID: 'ho00000005',
      subject: 'owner',
      topic: 'home',
      gist: 'home fact number 5 about the household',
      createdSequence: 5,
    },
    {
      itemID: '00000000-0000-4000-8000-000000000006',
      shortID: 'ho00000006',
      subject: 'owner',
      topic: 'home',
      gist: 'home fact number 6 about the household',
      createdSequence: 6,
    },
  ]);
});

test('it builds no row for a count of 0', () => {
  expect(buildIndexRows('home', 0)).toStrictEqual([]);
});
