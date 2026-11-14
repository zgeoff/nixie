import { expect, test } from 'bun:test';
import { mergeRankings } from './merge-rankings';

test('it puts an item both rankings place first, with its keyword score and its similarity', () => {
  expect(
    mergeRankings(
      [
        { itemID: 'item-a', score: 2.1 },
        { itemID: 'item-b', score: 1.4 },
      ],
      [
        { itemID: 'item-c', similarity: 0.62 },
        { itemID: 'item-b', similarity: 0.55 },
      ],
    ),
  ).toStrictEqual([
    { itemID: 'item-b', score: 1.4, similarity: 0.55 },
    { itemID: 'item-a', score: 2.1 },
    { itemID: 'item-c', similarity: 0.62 },
  ]);
});

test('it keeps the keyword order when the vector ranking is empty', () => {
  expect(
    mergeRankings(
      [
        { itemID: 'item-a', score: 2.1 },
        { itemID: 'item-b', score: 1.4 },
      ],
      [],
    ),
  ).toStrictEqual([
    { itemID: 'item-a', score: 2.1 },
    { itemID: 'item-b', score: 1.4 },
  ]);
});

test('it keeps the vector order when the keyword ranking is empty', () => {
  expect(
    mergeRankings(
      [],
      [
        { itemID: 'item-c', similarity: 0.62 },
        { itemID: 'item-d', similarity: 0.41 },
      ],
    ),
  ).toStrictEqual([
    { itemID: 'item-c', similarity: 0.62 },
    { itemID: 'item-d', similarity: 0.41 },
  ]);
});

test('it orders by rank and not by score, since the two scores share no scale', () => {
  expect(
    mergeRankings([{ itemID: 'item-a', score: 9.5 }], [{ itemID: 'item-c', similarity: 0.31 }]),
  ).toStrictEqual([
    { itemID: 'item-a', score: 9.5 },
    { itemID: 'item-c', similarity: 0.31 },
  ]);
});
