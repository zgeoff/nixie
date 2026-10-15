import type { ModelPrices } from './types';

// The token counts of one Messages API response, in the API's own field names. The cache writes
// split by lifetime under cache_creation, which an endpoint without 1-hour entries may leave out.
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

// The cost of one model call, in the currency of the profile's prices. Only the writes the response
// reports as 5-minute take the 5-minute price, and a split larger than the total counts in full, so
// a missing or inconsistent count never lowers a charge.
export function buildCallCost(usage: CallUsage, prices: ModelPrices): number {
  const cacheWrites5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;

  const cacheWrites = Math.max(
    usage.cache_creation_input_tokens ?? 0,
    cacheWrites5m + (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
  );

  return (
    (usage.input_tokens * prices.input +
      cacheWrites5m * prices.cacheWrite +
      (cacheWrites - cacheWrites5m) * prices.cacheWrite1h +
      (usage.cache_read_input_tokens ?? 0) * prices.cachedInput +
      usage.output_tokens * prices.output) /
    1_000_000
  );
}
