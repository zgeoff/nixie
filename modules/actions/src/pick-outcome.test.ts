import { expect, test } from 'bun:test';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import { pickOutcome } from './pick-outcome';

test('it maps a success to done', () => {
  expect(pickOutcome({ kind: 'success', result: {} }, 1, defaultRetryDelaysMs)).toStrictEqual({
    status: 'done',
  });
});

test('it maps a refusal with no effect to failed', () => {
  expect(
    pickOutcome({ kind: 'refused', reason: 'bad request' }, 1, defaultRetryDelaysMs),
  ).toStrictEqual({ status: 'failed', reason: 'refused' });
});

test('it maps a refusal that can clear to pending, retried after a delay', () => {
  expect(
    pickOutcome({ kind: 'refused_retryable', reason: 'rate limited' }, 1, defaultRetryDelaysMs),
  ).toStrictEqual({ status: 'pending', reason: 'refusal_can_clear', delayMs: 30_000 });
});

test('it maps a timeout, a dropped connection or an ambiguity to unknown', () => {
  expect(
    pickOutcome({ kind: 'ambiguous', reason: 'socket hang up' }, 1, defaultRetryDelaysMs),
  ).toStrictEqual({ status: 'unknown', reason: 'ambiguous' });
});

test.each([
  [1, 30_000],
  [2, 120_000],
  [3, 480_000],
  [4, 1_800_000],
])('it waits after attempt %d by the default schedule: %d ms', (attempt, delayMs) => {
  expect(
    pickOutcome(
      { kind: 'refused_retryable', reason: 'rate limited' },
      attempt,
      defaultRetryDelaysMs,
    ),
  ).toStrictEqual({ status: 'pending', reason: 'refusal_can_clear', delayMs });
});

test('it fails an action refused on its fifth attempt', () => {
  expect(
    pickOutcome({ kind: 'refused_retryable', reason: 'rate limited' }, 5, defaultRetryDelaysMs),
  ).toStrictEqual({ status: 'failed', reason: 'retries_exhausted' });
});

test('it waits longer when the provider names a later retry time', () => {
  expect(
    pickOutcome(
      { kind: 'refused_retryable', reason: 'rate limited', retryAfterMs: 90_000 },
      1,
      defaultRetryDelaysMs,
    ),
  ).toStrictEqual({ status: 'pending', reason: 'refusal_can_clear', delayMs: 90_000 });
});

test('it keeps the schedule when the provider names an earlier retry time', () => {
  expect(
    pickOutcome(
      { kind: 'refused_retryable', reason: 'rate limited', retryAfterMs: 1000 },
      2,
      defaultRetryDelaysMs,
    ),
  ).toStrictEqual({ status: 'pending', reason: 'refusal_can_clear', delayMs: 120_000 });
});

test.each([
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
])('it keeps the schedule when the provider names %s as its retry time', (_label, retryAfterMs) => {
  expect(
    pickOutcome(
      { kind: 'refused_retryable', reason: 'rate limited', retryAfterMs },
      1,
      defaultRetryDelaysMs,
    ),
  ).toStrictEqual({ status: 'pending', reason: 'refusal_can_clear', delayMs: 30_000 });
});

test('it follows a schedule a connector sets in place of the default', () => {
  expect(pickOutcome({ kind: 'refused_retryable', reason: 'busy' }, 2, [5000])).toStrictEqual({
    status: 'failed',
    reason: 'retries_exhausted',
  });
});
