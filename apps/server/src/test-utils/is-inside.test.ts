import { expect, test } from 'bun:test';
import { isInside } from './is-inside';

test.each([
  { file: 'modules/api/src/a.ts', where: 'modules/api', expected: true },
  { file: 'modules/api/src/a.ts', where: 'modules/api/src/a.ts', expected: true },
  { file: 'modules/apis/src/a.ts', where: 'modules/api', expected: false },
])('it finds $file inside $where is $expected', (row) => {
  expect(isInside(row.file, row.where)).toBe(row.expected);
});
