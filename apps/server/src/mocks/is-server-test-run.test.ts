import { expect, test } from 'bun:test';
import { isServerTestRun } from './is-server-test-run';

test.each([
  { argv: ['bun', 'test'], expected: true },
  { argv: ['bun', 'test', '--parallel=4'], expected: true },
  {
    argv: ['bun', 'test', './apps/server/src/test-utils/read-test-bundle.test.ts'],
    expected: true,
  },
  { argv: ['bun', 'test', './libs/clock/src/format-age.test.ts'], expected: false },
  {
    argv: ['bun', 'test', './libs/clock/src/format-age.test.ts', './apps/server/src/a.test.ts'],
    expected: true,
  },
])('it answers $expected for the run $argv', (row) => {
  expect(isServerTestRun(row.argv)).toBe(row.expected);
});
