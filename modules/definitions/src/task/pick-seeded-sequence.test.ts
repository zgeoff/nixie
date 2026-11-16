import { expect, test } from 'bun:test';
import { pickSeededSequence } from './pick-seeded-sequence';

test.each([
  {
    title: 'takes the oldest seed of the newest run that holds the hash',
    seeds: [
      { recordSequence: 90, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
      { recordSequence: 70, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
      { recordSequence: 50, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-1' }] },
      { recordSequence: 30, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
    ],
    expected: 70,
  },
  {
    title: 'takes the newest seed when the one before it holds another hash',
    seeds: [
      { recordSequence: 90, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
      { recordSequence: 70, tasks: [] },
    ],
    expected: 90,
  },
  {
    title: 'takes the oldest seed when every seed holds the hash',
    seeds: [
      { recordSequence: 90, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
      { recordSequence: 70, tasks: [{ id: 'water-the-tomatoes', hash: 'hash-2' }] },
    ],
    expected: 70,
  },
  { title: 'finds none without a seed', seeds: [], expected: null },
])('#pickSeededSequence $title', (row) => {
  expect(pickSeededSequence(row.seeds, 'water-the-tomatoes', 'hash-2')).toBe(row.expected);
});
