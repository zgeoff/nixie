import type { ModelPrices, PriceRates } from './types';

export interface CallUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation?: {
    readonly ephemeral_5m_input_tokens?: number | null;
    readonly ephemeral_1h_input_tokens?: number | null;
  } | null;
}

export function buildCallCost(usage: CallUsage, prices: ModelPrices): number {
  const cacheWrites5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;

  // An endpoint can leave out the split by cache lifetime, or report one that disagrees with the
  // total, so the larger count wins and a missing count never lowers a charge.
  const cacheWrites = Math.max(
    usage.cache_creation_input_tokens ?? 0,
    cacheWrites5m + (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
  );

  const cacheReads = usage.cache_read_input_tokens ?? 0;
  const rates = pickCallRates(prices, usage.input_tokens + cacheWrites + cacheReads);

  return (
    (usage.input_tokens * rates.input +
      cacheWrites5m * rates.cacheWrite +
      (cacheWrites - cacheWrites5m) * rates.cacheWrite1h +
      cacheReads * rates.cachedInput +
      usage.output_tokens * rates.output) /
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
