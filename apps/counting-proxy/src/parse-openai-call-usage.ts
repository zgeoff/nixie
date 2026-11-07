import type { ModelCallUsage } from '@heynixie/wire';
import { z } from 'zod';

const countSchema = z.int().nonnegative();

const cacheWriteSplitSchema = z.object({
  ttl_30m_tokens: countSchema.nullish(),
  ttl_12h_tokens: countSchema.nullish(),
});

const openAIUsageSchema = z.object({
  input_tokens: countSchema,
  output_tokens: countSchema,
  input_tokens_details: z
    .object({
      cached_tokens: countSchema.nullish(),
      cache_write_tokens: countSchema.nullish(),
      cache_write_tokens_details: cacheWriteSplitSchema.nullish(),
    })
    .nullish(),
  output_tokens_details: z.object({ reasoning_tokens: countSchema.nullish() }).nullish(),
});

// The Responses API counts cache reads and writes inside the input count. A price table names a
// shorter and a longer cache lifetime, so a 30-minute write prices as the shorter, and a 12-hour
// write, or one with no lifetime, as the longer, which costs more.
export function parseOpenAICallUsage(value: unknown): ModelCallUsage | null {
  const parsed = openAIUsageSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const usage = parsed.data;
  const input = usage.input_tokens_details;
  const split = input?.cache_write_tokens_details;
  const cacheReadTokens = input?.cached_tokens ?? 0;
  const cacheWrite5mTokens = split?.ttl_30m_tokens ?? 0;

  const cacheWriteTokens = Math.max(
    input?.cache_write_tokens ?? 0,
    cacheWrite5mTokens + (split?.ttl_12h_tokens ?? 0),
  );

  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;

  return {
    uncachedInputTokens: Math.max(0, usage.input_tokens - cacheReadTokens - cacheWriteTokens),
    cacheReadTokens,
    cacheWrite5mTokens,
    cacheWrite1hTokens: cacheWriteTokens - cacheWrite5mTokens,
    outputTokens: usage.output_tokens,
    ...(reasoningTokens === null || reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}
