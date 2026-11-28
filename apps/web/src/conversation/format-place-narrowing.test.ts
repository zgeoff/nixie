import { expect, test } from 'bun:test';
import { formatPlaceNarrowing } from './format-place-narrowing';

test.each([
  {
    title: 'a lowered place with its level',
    narrowing: { place: 'tickets.example.com', trust: 'read', isRemoved: false },
    expected: 'Lowered tickets.example.com to read',
  },
  {
    title: 'a removed place',
    narrowing: { place: 'tickets.example.com', isRemoved: true },
    expected: 'Removed tickets.example.com',
  },
])('it words $title', (row) => {
  expect(formatPlaceNarrowing(row.narrowing)).toBe(row.expected);
});
