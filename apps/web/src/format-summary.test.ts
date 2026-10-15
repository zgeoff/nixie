import { expect, test } from 'bun:test';
import { formatSummary } from './format-summary';

test('it formats a summary with its trigger, the context before it and its own size', () => {
  expect(
    formatSummary({
      contextSize: 165_000,
      sequence: 21,
      summaryTokens: 1200,
      trigger: 'threshold',
    }),
  ).toBe('summarized (threshold) · 165k → 1.2k tokens');
});

test('it formats a summary whose session reported no context by its own size', () => {
  expect(formatSummary({ sequence: 21, summaryTokens: 1200, trigger: 'overflow' })).toBe(
    'summarized (overflow) · 1.2k-token summary',
  );
});
