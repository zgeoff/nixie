import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// a delivered version, with each match score an index gave its item
const recalledItemSchema = z.object({
  itemID: z.string(),
  version: z.int().positive(),
  score: z.number().exactOptional(),
  similarity: z.number().exactOptional(),
});

// A recall's delivered versions, how its query searched, and whether it fed a turn's note rather
// than the model's own recall. A recall holds no text.
export const memoryRecalledCodec = defineRecordCodec(
  'memory.recalled',
  z.object({
    items: recalledItemSchema.array(),
    searchMode: z.enum(['hybrid', 'keyword', 'keyword-fallback']).exactOptional(),
    isTurnNote: z.literal(true).exactOptional(),
  }),
);
