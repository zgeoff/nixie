import type { ModelPrices } from '../types';
import { buildCallCost } from './build-call-cost';

export interface TokenCounts {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly cacheReadTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}

// The dollars of the token totals that a record holds. The records sum their calls and leave out
// the split of cache writes by lifetime, so the cost prices every cache write at the longer
// lifetime's price and never undercounts. A count that the record lacks prices as nothing.
export function buildTokensCost(tokens: TokenCounts, prices: ModelPrices): number {
  return buildCallCost(
    {
      uncachedInputTokens: tokens.inputTokens ?? 0,
      cacheReadTokens: tokens.cacheReadTokens ?? 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: tokens.cacheWriteTokens ?? 0,
      outputTokens: tokens.outputTokens ?? 0,
    },
    prices,
  );
}
