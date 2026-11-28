import { expect, test } from 'bun:test';
import type { ConnectorFailure } from '../types';
import type { RetryWait } from './pick-retry-wait';
import { pickRetryWait } from './pick-retry-wait';

interface WaitCase {
  readonly name: string;
  readonly failure: ConnectorFailure;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly jitter: number;
  readonly expected: RetryWait;
}

test.each<WaitCase>([
  {
    name: 'a refusal',
    failure: { code: 'refused', status: 400 },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'a refused fetch',
    failure: { code: 'fetch_refused' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'an unavailable connection',
    failure: { code: 'connection_unavailable' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'a failure after the last attempt',
    failure: { code: 'failed' },
    attempts: 3,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'the first failure',
    failure: { code: 'failed' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'wait', waitMs: 1000 },
  },
  {
    name: 'the second failure',
    failure: { code: 'failed' },
    attempts: 2,
    elapsedMs: 1000,
    jitter: 0.5,
    expected: { kind: 'wait', waitMs: 2000 },
  },
  {
    name: 'no answer',
    failure: { code: 'no_answer' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'wait', waitMs: 1000 },
  },
  {
    name: 'the lowest jitter',
    failure: { code: 'failed' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0,
    expected: { kind: 'wait', waitMs: 750 },
  },
  {
    name: 'the highest jitter',
    failure: { code: 'failed' },
    attempts: 2,
    elapsedMs: 0,
    jitter: 1,
    expected: { kind: 'wait', waitMs: 2500 },
  },
  {
    name: 'a rate limit with no time',
    failure: { code: 'rate_limited' },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'wait', waitMs: 1000 },
  },
  {
    name: 'a rate limit with a time inside the budget',
    failure: { code: 'rate_limited', retryAfterMs: 9000 },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'wait', waitMs: 9000 },
  },
  {
    name: 'a rate limit with a time past the budget',
    failure: { code: 'rate_limited', retryAfterMs: 15_000 },
    attempts: 1,
    elapsedMs: 0,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'a rate limit with a time past the time left',
    failure: { code: 'rate_limited', retryAfterMs: 5000 },
    attempts: 2,
    elapsedMs: 10_000,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
  {
    name: 'a backoff past the time left',
    failure: { code: 'failed' },
    attempts: 2,
    elapsedMs: 13_500,
    jitter: 0.5,
    expected: { kind: 'stop' },
  },
])('#pickRetryWait picks $expected.kind for $name', (row) => {
  const wait = pickRetryWait(
    row.failure,
    { attempts: row.attempts, elapsedMs: row.elapsedMs },
    { maxAttempts: 3, budgetMs: 15_000, detailChars: 1000 },
    row.jitter,
  );

  expect(wait).toStrictEqual(row.expected);
});
