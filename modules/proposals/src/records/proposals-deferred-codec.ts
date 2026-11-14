import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const proposalsDeferredCodec = defineRecordCodec(
  'proposals.deferred',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    generation: z.int().positive(),
    deferUntil: z.number(),
    returnAt: z.number(),
    lapsesAt: z.number(),
  }),
);
