import type { CallUsage } from '@heynixie/models';
import { z } from 'zod';

const countSchema = z.number().nonnegative().nullish();

const reportedUsageSchema = z.object({
  input_tokens: countSchema,
  output_tokens: countSchema,
  cache_creation_input_tokens: countSchema,
  cache_read_input_tokens: countSchema,
  cache_creation: z
    .object({ ephemeral_5m_input_tokens: countSchema, ephemeral_1h_input_tokens: countSchema })
    .nullish(),
});

export function parseReportedUsage(value: unknown): CallUsage | null {
  const parsed = reportedUsageSchema.safeParse(value);

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

  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    cache_creation:
      usage.cache_creation === null || usage.cache_creation === undefined
        ? null
        : {
            ephemeral_5m_input_tokens: usage.cache_creation.ephemeral_5m_input_tokens ?? null,
            ephemeral_1h_input_tokens: usage.cache_creation.ephemeral_1h_input_tokens ?? null,
          },
  };
}
