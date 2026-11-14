import { expect, test } from 'bun:test';
import { collectOutListing, isFilesLimitPassed } from './collect-out-listing';

test('it lists each file of the find output in path order', () => {
  const output = new TextEncoder().encode('5 b.txt\u00006 a/c.csv\u0000');

  expect(collectOutListing(output)).toStrictEqual([
    { path: 'out/a/c.csv', bytes: 6 },
    { path: 'out/b.txt', bytes: 5 },
  ]);
});

test('it keeps a space inside a path', () => {
  const output = new TextEncoder().encode('3 my chart.png\u0000');

  expect(collectOutListing(output)).toStrictEqual([{ path: 'out/my chart.png', bytes: 3 }]);
});

test('it lists nothing for an empty output', () => {
  expect(collectOutListing(new Uint8Array())).toStrictEqual([]);
});

test.each([
  { name: 'a cut listing', files: 0, bytes: 0, isCut: true, expected: true },
  { name: '51 files', files: 51, bytes: 1, isCut: false, expected: true },
  { name: '50 files', files: 50, bytes: 1, isCut: false, expected: false },
  { name: 'more than 20 MiB', files: 1, bytes: 20 * 1024 * 1024 + 1, isCut: false, expected: true },
  { name: 'exactly 20 MiB', files: 1, bytes: 20 * 1024 * 1024, isCut: false, expected: false },
])('it says $expected for $name', (row) => {
  const listed = Array.from({ length: row.files }, () => ({
    path: 'out/a',
    bytes: row.files === 1 ? row.bytes : 1,
  }));

  expect(isFilesLimitPassed(listed, row.isCut)).toBe(row.expected);
});
