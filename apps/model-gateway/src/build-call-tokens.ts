import type { ModelCallUsage } from '@heynixie/wire';

export function buildCallTokens(usage: ModelCallUsage): number {
  return (
    usage.uncachedInputTokens +
    usage.cacheWrite5mTokens +
    usage.cacheWrite1hTokens +
    usage.cacheReadTokens +
    usage.outputTokens
  );
}
