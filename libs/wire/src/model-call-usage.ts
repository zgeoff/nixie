import { z } from 'zod';

const countSchema = z.int().nonnegative();

// One model API call's usage in nixie's own terms, whatever API the call spoke. The reasoning
// tokens are a part of the output tokens, so a price counts them once, as output.
export const modelCallUsageSchema = z
  .object({
    uncachedInputTokens: countSchema,
    cacheReadTokens: countSchema,
    cacheWrite5mTokens: countSchema,
    cacheWrite1hTokens: countSchema,
    outputTokens: countSchema,
    reasoningTokens: countSchema.optional(),
  })
  .readonly();

export type ModelCallUsage = z.infer<typeof modelCallUsageSchema>;
