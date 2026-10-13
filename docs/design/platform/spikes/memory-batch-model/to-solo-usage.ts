import type { Usage } from './run-writer.ts';

// Samples run in parallel, so a batch can read a cache another sample wrote. A lone writer starts
// cold: the first call of its first batch writes the shared preamble to the cache, and each later
// call, a clash retry included, reads only that preamble and writes the rest. The excess read is
// therefore repriced as a write.
export const SHARED_PREFIX = 1067;

// Returns the usage a lone writer pays for the batch at `batchIndex` in its sample. A retried
// batch's usage sums 2 calls, and the retry is always warm.
export function toSoloUsage(batch: { retried: boolean; usage: Usage }, batchIndex: number): Usage {
  const calls = batch.retried ? 2 : 1;
  const warmCalls = batchIndex === 0 ? calls - 1 : calls;
  const excess = Math.max(0, batch.usage.cacheRead - warmCalls * SHARED_PREFIX);
  return {
    ...batch.usage,
    cacheRead: batch.usage.cacheRead - excess,
    cacheWrite: batch.usage.cacheWrite + excess,
  };
}
