import { expect, test } from 'bun:test';
import { formatCompaction } from './format-compaction';

test('it formats a compaction with its trigger and its tokens before and after', () => {
  expect(
    formatCompaction({ postTokens: 42_000, preTokens: 384_000, sequence: 20, trigger: 'auto' }),
  ).toBe('compacted (auto) · 384k → 42k tokens');
});

test('it formats a compaction with no after count by its tokens before', () => {
  expect(formatCompaction({ preTokens: 384_000, sequence: 20, trigger: 'manual' })).toBe(
    'compacted (manual) · 384k tokens before',
  );
});
