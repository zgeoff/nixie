import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { CheckerRequest, RunCheck } from './checker-types';
import { parseCheckerAnswer } from './parse-checker-answer';

export interface CheckerOptions {
  readonly ask: (request: CheckerRequest, signal: AbortSignal) => Promise<unknown>;

  readonly model: string;

  readonly clock?: Clock;
  readonly timeoutMs?: number;
}

const defaultTimeoutMs = 20_000;
const timedOut: unique symbol = Symbol('timed out');

export function makeChecker(options: CheckerOptions): RunCheck {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return async (request) => {
    const controller = new AbortController();

    try {
      const output = await waitForOutput(options.ask(request, controller.signal), {
        clock: options.clock ?? systemClock,
        timeoutMs,
      });

      if (output === timedOut) {
        return {
          verdict: 'unsure',
          reason: 'the checker did not answer in time',
          model: options.model,
          failure: 'timeout',
        };
      }

      return parseCheckerAnswer(output, options.model);
    } catch {
      return {
        verdict: 'unsure',
        reason: 'the checker failed',
        model: options.model,
        failure: 'error',
      };
    } finally {
      controller.abort();
    }
  };
}

interface Timeout {
  readonly clock: Clock;
  readonly timeoutMs: number;
}

async function waitForOutput(query: Promise<unknown>, timeout: Timeout): Promise<unknown> {
  const timer = new AbortController();

  try {
    return await Promise.race([query, waitForTimeout(timeout, timer.signal)]);
  } finally {
    timer.abort();
  }
}

async function waitForTimeout(timeout: Timeout, signal: AbortSignal): Promise<typeof timedOut> {
  await timeout.clock.sleep(timeout.timeoutMs, signal);

  return timedOut;
}
