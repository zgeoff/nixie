import { expect, test } from 'bun:test';
import { buildCheckNote } from './build-check-note';

test('it builds a note whose ID follows its short ID', () => {
  expect(buildCheckNote('abc', 3, true)).toStrictEqual({
    noteID: 'abc-uuid',
    shortID: 'abc',
    title: 'Title abc',
    editedAt: 3,
    isPrivate: true,
  });
});
