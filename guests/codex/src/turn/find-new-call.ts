import type { ModelCallUsage } from '@heynixie/wire';
import type { TokenBreakdown } from './parse-notification';

export interface TokenUpdate {
  readonly total: TokenBreakdown;
  readonly last: TokenBreakdown;
}

// The CLI repeats a stored figure after a resume or a compaction, and sends one update for each
// model call. An update is a new call only when its total grew by its last figure.
export function findNewCall(
  previousTotalTokens: number,
  update: TokenUpdate,
): ModelCallUsage | null {
  if (update.total.totalTokens - previousTotalTokens !== update.last.totalTokens) {
    return null;
  }

  if (update.last.totalTokens === 0) {
    return null;
  }

  const last = update.last;

  return {
    uncachedInputTokens: Math.max(
      0,
      last.inputTokens - last.cachedInputTokens - last.cacheWriteInputTokens,
    ),
    cacheReadTokens: last.cachedInputTokens,
    cacheWrite5mTokens: 0,

    // a cache write counts at the 1-hour price, the higher one, so a cost is never below the real
    // cost
    cacheWrite1hTokens: last.cacheWriteInputTokens,
    outputTokens: last.outputTokens,
    reasoningTokens: last.reasoningOutputTokens,
  };
}
