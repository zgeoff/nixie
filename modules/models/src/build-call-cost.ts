import type { ModelCallUsage } from '@heynixie/wire';
import type { ModelPrices, PriceRates } from './types';

export function buildCallCost(usage: ModelCallUsage, prices: ModelPrices): number {
  const rates = pickCallRates(
    prices,
    usage.uncachedInputTokens +
      usage.cacheWrite5mTokens +
      usage.cacheWrite1hTokens +
      usage.cacheReadTokens,
  );

  return (
    (usage.uncachedInputTokens * rates.input +
      usage.cacheWrite5mTokens * rates.cacheWrite +
      usage.cacheWrite1hTokens * rates.cacheWrite1h +
      usage.cacheReadTokens * rates.cachedInput +
      usage.outputTokens * rates.output) /
    1_000_000
  );
}

// A provider that prices by prompt length charges the whole call, output included, at the long
// prompt's rates once the prompt passes the boundary, so no part of the call keeps the base rates.
function pickCallRates(prices: ModelPrices, promptTokens: number): PriceRates {
  if (prices.longPrompt !== undefined && promptTokens > prices.longPrompt.overTokens) {
    return prices.longPrompt;
  }

  return prices;
}
