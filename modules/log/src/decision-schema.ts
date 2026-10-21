import { z } from 'zod';
import type { Decision } from './types';

const destinationSchema = z.object({ destination: z.string(), permission: z.string().nullable() });

export const decisionSchema = z.object({
  outcome: z.enum(['allow', 'ask', 'deny']),
  stage: z.number(),
  rule: z.object({ id: z.string(), revision: z.number() }).nullable(),
  destinations: destinationSchema.array().exactOptional(),
  consent: z.object({ messageSequence: z.number(), verdict: z.string() }).exactOptional(),
  autoMode: z
    .object({ verdict: z.string(), reason: z.string(), inputsHash: z.string() })
    .exactOptional(),
}) satisfies z.ZodType<Decision>;
