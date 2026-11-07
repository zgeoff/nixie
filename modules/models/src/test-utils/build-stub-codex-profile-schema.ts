import { z } from 'zod';
import { modelPricesSchema } from '../model-prices-schema';

// A stand-in for a second harness's profile schema, whose profiles take no fields of their own.
export function buildStubCodexProfileSchema() {
  return z
    .strictObject({
      harness: z.literal('codex'),
      base_url: z.url(),
      credential: z.string(),
      model: z.string(),
      prices: modelPricesSchema.optional(),
    })
    .transform((input) => ({
      harness: input.harness,
      baseURL: input.base_url,
      credential: input.credential,
      authHeader: 'bearer' as const,
      model: input.model,
      effort: 'medium' as const,
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m' as const,
      prices: input.prices ?? null,
    }));
}
