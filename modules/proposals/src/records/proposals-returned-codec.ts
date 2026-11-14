import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const proposalsReturnedCodec = defineRecordCodec(
  'proposals.returned',
  z.object({ proposalID: z.string(), shortID: z.string(), generation: z.int().positive() }),
);
