import type { TokenBreakdown } from '../turn/parse-notification';

// The output tokens are what the total holds beyond the input.
export function buildMockTokenBreakdown(overrides: Partial<TokenBreakdown> = {}): TokenBreakdown {
  const totalTokens = overrides.totalTokens ?? 110;
  const inputTokens = overrides.inputTokens ?? 100;

  return {
    totalTokens,
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: totalTokens - inputTokens,
    reasoningOutputTokens: 1,
    ...overrides,
  };
}
