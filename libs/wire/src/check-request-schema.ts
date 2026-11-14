import { z } from 'zod';
import { turnProfileSchema } from './host-frame';

export const checkRequestSchema = z
  .object({
    profile: turnProfileSchema,
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
