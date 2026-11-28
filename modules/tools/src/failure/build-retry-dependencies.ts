import type { ToolCallOptions } from '../call-record/tool-call-options';
import { defaultDetailChars } from './constants';
import type { RetryDependencies } from './run-with-retries';

// 3 attempts within 15 seconds, and the first 1,000 characters of the provider's message
export function buildRetryDependencies(options: ToolCallOptions): RetryDependencies {
  return {
    clock: options.log.writer.clock,
    config: {
      maxAttempts: options.retry?.maxAttempts ?? 3,
      budgetMs: options.retry?.budgetMs ?? 15_000,
      detailChars: options.retry?.detailChars ?? defaultDetailChars,
    },
    random: options.retry?.random ?? Math.random,
  };
}
