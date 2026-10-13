import type { Usage } from './run-writer.ts';

// Samples run in parallel, so a batch can read a cache another sample wrote. A lone writer starts
// cold: its first batch writes the shared preamble to the cache, and each later batch reads only
// that preamble and writes the rest. The excess read is therefore repriced as a write.
const SHARED_PREFIX = 1067;

// Returns the usage a lone writer pays for the batch at `batchIndex` in its sample.
export function toSoloUsage(usage: Usage, batchIndex: number): Usage {
  const cached = batchIndex === 0 ? 0 : SHARED_PREFIX;
  const excess = Math.max(0, usage.cacheRead - cached);
  return { ...usage, cacheRead: usage.cacheRead - excess, cacheWrite: usage.cacheWrite + excess };
}
