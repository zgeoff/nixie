import { z } from 'zod';

// The guest never sees the profile's credential: the sandbox's grant injects it, and the guest holds
// a placeholder.
const checkProfileSchema = z
  .object({
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    authHeader: z.enum(['bearer', 'x-api-key']),
  })
  .readonly();

export const checkRequestSchema = z
  .object({
    profile: checkProfileSchema,
    systemPrompt: z.string().min(1),
    input: z.string().min(1),
  })
  .readonly();

export type CheckRequest = z.infer<typeof checkRequestSchema>;

export const checkReplySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('answer'),
      output: z.unknown(),
      costUSD: z.number(),
      durationMs: z.number().nonnegative(),
      apiMs: z.number().nonnegative(),
    })
    .readonly(),
  z.object({ kind: z.literal('failed'), reason: z.string() }).readonly(),
]);

export type CheckReply = z.infer<typeof checkReplySchema>;
