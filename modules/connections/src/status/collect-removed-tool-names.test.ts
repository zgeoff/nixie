import { expect, test } from 'bun:test';
import { collectRemovedToolNames } from './collect-removed-tool-names';

test.each([
  { status: 'needs_consent', expected: ['gmail.search'] },
  { status: 'failing', expected: [] },
  { status: 'expiring', expected: [] },
] as const)('it removes $expected for a connection that is $status', (row) => {
  expect(collectRemovedToolNames(row.status, ['gmail.search'])).toStrictEqual([...row.expected]);
});
