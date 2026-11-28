import { expect, test } from 'bun:test';
import { CredentialRefusalError } from '@heynixie/egress';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock, runClockUntil } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import type { ToolOutcome } from '../types';
import { runWithRetries } from './run-with-retries';

type Step = ToolOutcome | Error | 'never';

interface Finished {
  readonly outcome: ToolOutcome;
  readonly atMs: number;
}

function setupTest(steps: readonly Step[], overrides: { maxAttempts?: number } = {}) {
  const clock = createFakeClock({ startMs: Date.parse('2026-03-02T09:14:00Z') });
  const startedAtMs = clock.now();
  const finished: Finished[] = [];
  const calls = { count: 0 };
  const signals: AbortSignal[] = [];

  const attempt = (signal: AbortSignal): Promise<ToolOutcome> => {
    signals.push(signal);

    const step = steps[Math.min(calls.count, steps.length - 1)];

    invariant(step !== undefined, 'a test gives at least one step');

    calls.count += 1;

    if (step === 'never') {
      const open = Promise.withResolvers<ToolOutcome>();

      signal.addEventListener(
        'abort',
        () => {
          open.reject(new Error('aborted'));
        },
        { once: true },
      );

      return open.promise;
    }

    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  };

  return {
    calls,
    signals,
    clock,
    finished,
    start: () => {
      void (async () => {
        const outcome = await runWithRetries(attempt, {
          clock,
          config: { maxAttempts: overrides.maxAttempts ?? 3, budgetMs: 15_000, detailChars: 1000 },
          random: () => 0.5,
        });

        finished.push({ outcome, atMs: clock.now() - startedAtMs });
      })();
    },
    run: async (): Promise<Finished[]> => {
      void (async () => {
        const outcome = await runWithRetries(attempt, {
          clock,
          config: { maxAttempts: overrides.maxAttempts ?? 3, budgetMs: 15_000, detailChars: 1000 },
          random: () => 0.5,
        });

        finished.push({ outcome, atMs: clock.now() - startedAtMs });
      })();

      await runClockUntil(clock, () => finished.length === 1, { maxMs: 60_000, stepMs: 500 });

      return finished;
    },
  };
}

test('#runWithRetries tries again after 1 s and then 2 s until the call succeeds', async () => {
  const ctx = setupTest([
    { status: 'error', message: 'x', failure: { code: 'failed', status: 503 } },
    { status: 'error', message: 'x', failure: { code: 'failed' } },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    { outcome: { status: 'ok', result: { text: 'a note' } }, atMs: 3000 },
  ]);

  expect(ctx.calls.count).toBe(3);
});

test('#runWithRetries stops after 3 attempts and returns the failure as the message the model reads', async () => {
  const ctx = setupTest([
    {
      status: 'error',
      message: 'x',
      failure: { code: 'failed', status: 503, detail: 'backend busy' },
    },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    {
      outcome: {
        status: 'error',
        message: JSON.stringify({
          origin: 'provider',
          kind: 'failed',
          status: 503,
          detail: 'backend busy',
        }),
        failure: { code: 'failed', status: 503, detail: 'backend busy' },
      },
      atMs: 3000,
    },
  ]);

  expect(ctx.calls.count).toBe(3);
});

test('#runWithRetries stops after the attempts it is configured for', async () => {
  const ctx = setupTest([{ status: 'error', message: 'x', failure: { code: 'failed' } }], {
    maxAttempts: 2,
  });

  const finished = await ctx.run();

  expect(finished.map((entry) => entry.atMs)).toStrictEqual([1000]);
  expect(ctx.calls.count).toBe(2);
});

test('#runWithRetries returns a refusal at once with no retry', async () => {
  const ctx = setupTest([
    { status: 'error', message: 'x', failure: { code: 'refused', status: 403 } },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished.map((entry) => entry.atMs)).toStrictEqual([0]);
  expect(ctx.calls.count).toBe(1);
});

test('#runWithRetries waits for the retry time of a rate limit', async () => {
  const ctx = setupTest([
    {
      status: 'error',
      message: 'x',
      failure: { code: 'rate_limited', status: 429, retryAfterMs: 6000 },
    },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    { outcome: { status: 'ok', result: { text: 'a note' } }, atMs: 6000 },
  ]);
});

test('#runWithRetries returns a rate limit at once with its retry time when the wait passes the budget', async () => {
  const ctx = setupTest([
    {
      status: 'error',
      message: 'x',
      failure: { code: 'rate_limited', status: 429, retryAfterMs: 60_000 },
    },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    {
      outcome: {
        status: 'error',
        message: JSON.stringify({
          origin: 'provider',
          kind: 'rate_limited',
          status: 429,
          retryAfter: '2026-03-02T09:15:00.000Z',
        }),
        failure: { code: 'rate_limited', status: 429, retryAfterMs: 60_000 },
      },
      atMs: 0,
    },
  ]);

  expect(ctx.calls.count).toBe(1);
});

test('#runWithRetries returns a rate limit whose wait passes the time left without waiting', async () => {
  const ctx = setupTest([
    { status: 'error', message: 'x', failure: { code: 'failed' } },
    { status: 'error', message: 'x', failure: { code: 'rate_limited', retryAfterMs: 14_000 } },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished.map((entry) => entry.atMs)).toStrictEqual([1000]);
  expect(ctx.calls.count).toBe(2);
});

test('#runWithRetries counts a throw as no answer and tries again', async () => {
  const ctx = setupTest([
    new Error('connection reset'),
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    { outcome: { status: 'ok', result: { text: 'a note' } }, atMs: 1000 },
  ]);
});

test('#runWithRetries reports the refusal of the fetcher at once, as a refusal that nixie wrote', async () => {
  const ctx = setupTest([
    new CredentialRefusalError('the host is not one of the credential hosts'),
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    {
      outcome: {
        status: 'error',
        message: JSON.stringify({
          origin: 'nixie',
          kind: 'fetch_refused',
          detail: 'the host is not one of the credential hosts',
        }),
        failure: { code: 'fetch_refused', detail: 'the host is not one of the credential hosts' },
      },
      atMs: 0,
    },
  ]);
});

test('#runWithRetries ends an attempt that is still open when the budget ends, with no answer', async () => {
  const ctx = setupTest(['never']);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    {
      outcome: {
        status: 'error',
        message: JSON.stringify({ origin: 'nixie', kind: 'no_answer' }),
        failure: { code: 'no_answer' },
      },
      atMs: 15_000,
    },
  ]);

  expect(ctx.calls.count).toBe(1);
});

test('#runWithRetries returns an error with no failure as it is, with no retry', async () => {
  const ctx = setupTest([
    { status: 'error', message: 'UNKNOWN_EVENT: no such event' },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    { outcome: { status: 'error', message: 'UNKNOWN_EVENT: no such event' }, atMs: 0 },
  ]);
});

test('#runWithRetries aborts an attempt that is still open when the budget ends', async () => {
  const ctx = setupTest(['never']);

  await ctx.run();

  expect(ctx.signals.map((signal) => signal.aborted)).toStrictEqual([true]);
});

test('#runWithRetries waits for an aborted attempt to settle before it returns', async () => {
  const clock = createFakeClock({ startMs: Date.parse('2026-03-02T09:14:00Z') });
  const open = Promise.withResolvers<ToolOutcome>();
  const finished: ToolOutcome[] = [];
  const signals: AbortSignal[] = [];

  void (async () => {
    const outcome = await runWithRetries(
      (signal) => {
        signals.push(signal);

        return open.promise;
      },
      {
        clock,
        config: { maxAttempts: 3, budgetMs: 15_000, detailChars: 1000 },
        random: () => 0.5,
      },
    );

    finished.push(outcome);
  })();

  await waitFor(() => clock.countPending() === 1);

  clock.advance(16_000);

  await waitFor(() => signals[0]?.aborted === true);

  const finishedWhileOpen = finished.length;

  open.resolve({ status: 'ok', result: { text: 'a note' } });

  await waitFor(() => finished.length === 1);

  expect(finishedWhileOpen).toBe(0);
  expect(finished).toStrictEqual([{ status: 'ok', result: { text: 'a note' } }]);
});

test('#runWithRetries leaves the signal of an attempt that answered unaborted', async () => {
  const ctx = setupTest([{ status: 'ok', result: { text: 'a note' } }]);

  await ctx.run();

  expect(ctx.signals.map((signal) => signal.aborted)).toStrictEqual([false]);
});

test('#runWithRetries starts no attempt when a wait ends after the budget, and returns the last failure', async () => {
  const ctx = setupTest([
    {
      status: 'error',
      message: 'x',
      failure: { code: 'rate_limited', status: 429, retryAfterMs: 14_000 },
    },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  ctx.start();

  await waitFor(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(16_000);

  await waitFor(() => ctx.finished.length === 1);

  expect(ctx.finished).toStrictEqual([
    {
      outcome: {
        status: 'error',
        message: JSON.stringify({
          origin: 'provider',
          kind: 'rate_limited',
          status: 429,
          retryAfter: '2026-03-02T09:14:14.000Z',
        }),
        failure: { code: 'rate_limited', status: 429, retryAfterMs: 14_000 },
      },
      atMs: 16_000,
    },
  ]);

  expect(ctx.calls.count).toBe(1);
});

test('#runWithRetries waits for the retry time of a rate limit that follows a server error', async () => {
  const ctx = setupTest([
    { status: 'error', message: 'x', failure: { code: 'failed', status: 503 } },
    { status: 'error', message: 'x', failure: { code: 'rate_limited', retryAfterMs: 10_000 } },
    { status: 'ok', result: { text: 'a note' } },
  ]);

  const finished = await ctx.run();

  expect(finished).toStrictEqual([
    { outcome: { status: 'ok', result: { text: 'a note' } }, atMs: 11_000 },
  ]);
});
