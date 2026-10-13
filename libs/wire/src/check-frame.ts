import { z } from 'zod';

// The model profile the checker runs on. The guest never sees the profile's credential: the
// sandbox's grant injects it, and the guest holds a placeholder.
const checkProfileSchema = z
  .object({
    model: z.string().min(1),
    baseURL: z.url(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
    authHeader: z.enum(['bearer', 'x-api-key']),
  })
  .readonly();

// The one frame the host sends the check guest: the profile, the checker's system prompt, and the
// input the gate built, which the guest sends as the only user message.
export const checkRequestSchema = z
  .object({
    profile: checkProfileSchema,
    systemPrompt: z.string().min(1),
    input: z.string().min(1),
  })
  .readonly();

export type CheckRequest = z.infer<typeof checkRequestSchema>;

// The one frame the check guest sends back: the query's structured output, which the host reads
// as a verdict, or the reason the query failed. An answer carries the query's time in the CLI and
// the share of it spent on model API calls, so the host can log where a check's time went.
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
