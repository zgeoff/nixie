import { expect, test } from 'bun:test';
import { formatMemoryChecks } from './format-memory-checks';

test('it lists each check with its verdict in the order the checks ran', () => {
  expect(
    formatMemoryChecks({
      quote: 'pass',
      tokens: 'fail',
      checker: { model: 'stub-checker', verdict: 'asserted' },
    }),
  ).toBe('quote passed · tokens failed · checker asserted');
});

test('it keeps a plain verdict the code checks do not name', () => {
  expect(formatMemoryChecks({ read: 'skipped' })).toBe('read skipped');
});

test('it leaves out a check whose verdict holds no plain value', () => {
  expect(formatMemoryChecks({ quote: 'pass', tokens: 3, checker: { model: 'stub-checker' } })).toBe(
    'quote passed',
  );
});
