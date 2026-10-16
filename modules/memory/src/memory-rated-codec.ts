import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// an item's verdict at the version the recall delivered, with the note sealed under its key
const ratingSchema = z.object({
  itemID: z.string(),
  version: z.int().positive(),
  verdict: z.enum(['helpful', 'noise', 'misleading']),
  sealedNote: z.string().exactOptional(),
});

// The model's ratings of a recall: the rating's ID, the recall it rates, the run that rated it, the
// role that rated when one did, and each item's rating.
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
