import { z } from 'zod';
import { getCLIContextWindow } from './get-cli-context-window';
import { modelPricesSchema } from './model-prices-schema';
import type { ModelProfile } from './types';

const credentialSchema = z
  .string()
  .regex(/^deployment:[\w-]+$/u, 'a credential reference reads deployment:<name>');

// The CLI's auto-compact window takes an integer in this range and clamps any other value.
const contextTokensSchema = z.int().min(100_000).max(1_000_000);

export const agentSDKProfileSchema = z
  .strictObject({
    harness: z.literal('agent-sdk'),
    base_url: z.url({ protocol: /^https?$/u }),
    credential: credentialSchema,
    auth_header: z.enum(['bearer', 'x-api-key']),
    model: z.string().min(1),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    provider_pin: z.string().min(1).optional(),
    context_tokens: contextTokensSchema.optional(),
    cache_ttl: z.enum(['5m', '1h']).optional(),
    prices: modelPricesSchema.optional(),
  })

  // With auto-compaction off, the CLI ignores the cap and refuses a call only against the window it
  // assumes for the model.
  .superRefine((profile, issues) => {
    const window = getCLIContextWindow(profile.model);

    if (profile.context_tokens !== undefined && profile.context_tokens > window) {
      issues.addIssue({
        code: 'custom',
        path: ['context_tokens'],
        message: `the context cap of ${String(profile.context_tokens)} tokens is larger than the ${String(window)}-token window the Claude CLI assumes for ${profile.model}`,
      });
    }
  })
  .transform((input): Omit<ModelProfile, 'id'> => ({
    harness: input.harness,
    baseURL: input.base_url,
    credential: input.credential,
    authHeader: input.auth_header,
    model: input.model,
    effort: input.effort,
    providerPin: input.provider_pin ?? null,
    contextTokens: input.context_tokens ?? null,

    // The CLI writes 5-minute entries on an API-key or bearer profile unless told otherwise.
    cacheTTL: input.cache_ttl ?? '5m',
    prices: input.prices ?? null,
  }));
