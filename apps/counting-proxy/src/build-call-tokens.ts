import type { CallUsage } from '@heynixie/models';

export function buildCallTokens(usage: CallUsage): number {
  // the larger cache-write count wins, as it does for the price, so a missing split never lowers
  // the count
  const cacheWrites = Math.max(
    usage.cache_creation_input_tokens ?? 0,
    (usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
      (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
  );

  return (
    usage.input_tokens + cacheWrites + (usage.cache_read_input_tokens ?? 0) + usage.output_tokens
  );
}
