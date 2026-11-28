import type { Clock } from '@heynixie/clock';
import type { ConnectorFailure, ToolOutcome } from '../types';
import { pickRetryWait } from './pick-retry-wait';
import { readThrownFailure } from './read-thrown-failure';
import { renderFailedOutcome } from './render-failed-outcome';
import type { RetryConfig } from './types';

export interface RetryDependencies {
  readonly clock: Pick<Clock, 'now' | 'sleep'>;
  readonly config: RetryConfig;
  readonly random: () => number;
}

type Failed = Extract<ToolOutcome, { readonly status: 'error' }>;

// Runs a call of a tool that reaches a provider, and tries again after a failure that can clear.
// Every attempt and every wait counts against one time budget. An attempt still open when it ends
// is aborted, and the call waits for it to settle. A wait that ends after it starts no attempt.
export async function runWithRetries(
  attempt: (signal: AbortSignal) => Promise<ToolOutcome>,
  dependencies: RetryDependencies,
): Promise<ToolOutcome> {
  const clock = dependencies.clock;
  const config = dependencies.config;
  const startedAtMs = clock.now();
  let lastFailed: { readonly outcome: Failed; readonly atMs: number } | null = null;

  for (let attempts = 1; ; attempts += 1) {
    const remainingMs = config.budgetMs - (clock.now() - startedAtMs);

    if (lastFailed !== null && remainingMs <= 0) {
      return renderFailedOutcome(lastFailed.outcome, dependencies, lastFailed.atMs);
    }

    const outcome = await runWithinBudget(attempt, clock, remainingMs);

    if (outcome.status !== 'error' || outcome.failure === undefined) {
      return outcome;
    }

    const wait = pickRetryWait(
      outcome.failure,
      { attempts, elapsedMs: clock.now() - startedAtMs },
      config,
      dependencies.random(),
    );

    if (wait.kind === 'stop') {
      return renderFailedOutcome(outcome, dependencies, clock.now());
    }

    lastFailed = { outcome, atMs: clock.now() };

    await clock.sleep(wait.waitMs);
  }
}

async function runWithinBudget(
  attempt: (signal: AbortSignal) => Promise<ToolOutcome>,
  clock: RetryDependencies['clock'],
  remainingMs: number,
): Promise<ToolOutcome> {
  const stopTimer = new AbortController();
  const stopAttempt = new AbortController();

  void (async () => {
    await clock.sleep(remainingMs, stopTimer.signal);

    // a sleep that the call's own end cancels resolves too, and that is no timeout
    if (!stopTimer.signal.aborted) {
      stopAttempt.abort();
    }
  })();

  try {
    return await attempt(stopAttempt.signal);
  } catch (error) {
    return buildFailed(readThrownFailure(error));
  } finally {
    stopTimer.abort();
  }
}

function buildFailed(failure: ConnectorFailure): Failed {
  return { status: 'error', message: failure.code, failure };
}
