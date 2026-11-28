import type { Clock } from '@heynixie/clock';
import type { ConnectorFailure, ToolOutcome } from '../types';
import { pickRetryWait } from './pick-retry-wait';
import { readThrownFailure } from './read-thrown-failure';
import { renderFailureMessage } from './render-failure-message';
import type { RetryConfig } from './types';

export interface RetryDependencies {
  readonly clock: Pick<Clock, 'now' | 'sleep'>;
  readonly config: RetryConfig;
  readonly random: () => number;
}

// Runs a call of a tool that reaches a provider, and tries again after a failure that can clear.
// Every attempt and every wait counts against one time budget, and an attempt still open when it
// ends reports no answer. A failed call returns the message the model reads.
export async function runWithRetries(
  attempt: () => Promise<ToolOutcome>,
  dependencies: RetryDependencies,
): Promise<ToolOutcome> {
  const clock = dependencies.clock;
  const config = dependencies.config;
  const startedAtMs = clock.now();

  for (let attempts = 1; ; attempts += 1) {
    const outcome = await runWithinBudget(
      attempt,
      clock,
      config.budgetMs - (clock.now() - startedAtMs),
    );

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
      return writeFailureMessage(outcome, outcome.failure, dependencies);
    }

    await clock.sleep(wait.waitMs);
  }
}

async function runWithinBudget(
  attempt: () => Promise<ToolOutcome>,
  clock: RetryDependencies['clock'],
  remainingMs: number,
): Promise<ToolOutcome> {
  const stopTimer = new AbortController();

  const timedOut = (async (): Promise<ToolOutcome> => {
    await clock.sleep(remainingMs, stopTimer.signal);

    return buildFailed({ code: 'no_answer' });
  })();

  const answered = (async (): Promise<ToolOutcome> => {
    try {
      return await attempt();
    } catch (error) {
      return buildFailed(readThrownFailure(error));
    }
  })();

  // the attempt that loses the race goes on in the background, and its answer is dropped
  const outcome = await Promise.race([answered, timedOut]);

  stopTimer.abort();

  return outcome;
}

type Failed = Extract<ToolOutcome, { readonly status: 'error' }>;

function buildFailed(failure: ConnectorFailure): Failed {
  return { status: 'error', message: failure.code, failure };
}

function writeFailureMessage(
  outcome: Failed,
  failure: ConnectorFailure,
  dependencies: RetryDependencies,
): Failed {
  return {
    ...outcome,
    message: renderFailureMessage(failure, {
      nowMs: dependencies.clock.now(),
      detailChars: dependencies.config.detailChars,
    }),
  };
}
