import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const ratingSchema = z.object({
  itemID: z.string(),
  version: z.int().positive(),
  verdict: z.enum(['helpful', 'noise', 'misleading']),
  sealedNote: z.string().exactOptional(),
});

export const memoryRatedCodec = defineRecordCodec(
  'memory.rated',
  z.object({
    ratingID: z.string(),
    recalledSequence: z.int(),
    runID: z.string(),
    ratedBy: z.string().exactOptional(),
    ratings: ratingSchema.array(),
  }),
);
