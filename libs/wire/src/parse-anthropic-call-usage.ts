import { z } from 'zod';
import type { ModelCallUsage } from './model-call-usage';

const countSchema = z.int().nonnegative().nullish();

const anthropicUsageSchema = z.object({
  input_tokens: countSchema,
  output_tokens: countSchema,
  cache_creation_input_tokens: countSchema,
  cache_read_input_tokens: countSchema,
  cache_creation: z
    .object({ ephemeral_5m_input_tokens: countSchema, ephemeral_1h_input_tokens: countSchema })
    .nullish(),
});

// Reads the usage an Anthropic Messages response reports, or null when it reports none.
export function parseAnthropicCallUsage(value: unknown): ModelCallUsage | null {
  const parsed = anthropicUsageSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const usage = parsed.data;

  const fields = [
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation,
  ];

  if (fields.every((field) => field === null || field === undefined)) {
    return null;
  }

  const cacheWrite5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;

  // An endpoint can leave out the split by cache lifetime, or report one that disagrees with the
  // total, so the larger count wins, and a write with no lifetime counts as the longer one, which
  // costs more.
  const cacheWriteTokens = Math.max(
    usage.cache_creation_input_tokens ?? 0,
    cacheWrite5mTokens + (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
  );

  return {
    uncachedInputTokens: usage.input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWrite5mTokens,
    cacheWrite1hTokens: cacheWriteTokens - cacheWrite5mTokens,
    outputTokens: usage.output_tokens ?? 0,
  };
}
