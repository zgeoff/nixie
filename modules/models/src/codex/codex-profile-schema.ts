import { codexEfforts } from '@heynixie/wire';
import { z } from 'zod';
import { modelPricesSchema } from '../agent/model-prices-schema';
import type { CodexProfile } from './codex-harness-definition';

const credentialSchema = z
  .string()
  .regex(/^deployment:[\w-]+$/u, 'a credential reference reads deployment:<name>');

// The strict object refuses auth_header: the broker always sends a Codex profile's secret as a
// bearer header.
export const codexProfileSchema = z
  .strictObject({
    harness: z.literal('codex'),
    base_url: z.url({ protocol: /^https?$/u }),
    credential: credentialSchema,
    model: z.string().min(1),
    effort: z.enum(codexEfforts),
    prices: modelPricesSchema.optional(),
  })
  .transform((input): Omit<CodexProfile, 'id'> => ({
    harness: input.harness,
    baseURL: input.base_url,
    credential: input.credential,
    model: input.model,
    effort: input.effort,
    prices: input.prices ?? null,
  }));
