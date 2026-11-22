import { expect, test } from 'bun:test';
import { findNoteSearchProblem } from './find-note-search-problem';

test.each<[string, string, string[], string | null]>([
  ['a 500-character query', 'q'.repeat(500), [], null],
  ['a 501-character query', 'q'.repeat(501), [], 'Search words can be at most 500 characters.'],
  ['10 tags', '', Array.from({ length: 10 }, (_, index) => `tag${index}`), null],
  [
    '11 tags',
    '',
    Array.from({ length: 11 }, (_, index) => `tag${index}`),
    'Search by at most 10 tags.',
  ],
  ['a 40-character tag', '', ['t'.repeat(40)], null],
  ['a 41-character tag', '', ['t'.repeat(41)], 'A tag can be at most 40 characters.'],
])('it answers %s', (_, query, tags, expected) => {
  expect(findNoteSearchProblem(query, tags)).toBe(expected);
});
