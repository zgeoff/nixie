import { parseCheckerAnswer } from './parse-checker-answer';
import type { CheckerRequest, RunCheck } from './types';

export interface CheckerOptions {
  // runs one checker query and returns its structured output; it stops when the signal aborts
  readonly ask: (request: CheckerRequest, signal: AbortSignal) => Promise<unknown>;

  // the model ID the checker role's profile names, which every answer records
  readonly model: string;
  readonly timeoutMs?: number;
}

// Makes the checker that the memory gates and the consent check share. A query that outlasts the
// timeout is aborted and answers unsure, and so does one that fails, so the checker fails closed.
export function makeChecker(options: CheckerOptions): RunCheck {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return async (request) => {
    const controller = new AbortController();

    try {
      const output = await waitForOutput(options.ask(request, controller.signal), timeoutMs);

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

const defaultTimeoutMs = 20_000;

// what the race settles to when the timeout fires first, which no structured output can equal
const timedOut: unique symbol = Symbol('timed out');

// settles to the query's output, or to timedOut when the timeout fires first
async function waitForOutput(query: Promise<unknown>, timeoutMs: number): Promise<unknown> {
  const timeout = Promise.withResolvers<typeof timedOut>();

  const timer = setTimeout(() => {
    timeout.resolve(timedOut);
  }, timeoutMs);

  try {
    return await Promise.race([query, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}
