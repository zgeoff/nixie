import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const recalledItemSchema = z.object({
  itemID: z.string(),
  version: z.int().positive(),
  score: z.number().exactOptional(),
  similarity: z.number().exactOptional(),

  // the keys of the trigger phrases that placed the item in a push
  triggers: z.string().array().exactOptional(),
});

export const memoryRecalledCodec = defineRecordCodec(
  'memory.recalled',
  z.object({
    items: recalledItemSchema.array(),
    searchMode: z.enum(['hybrid', 'keyword', 'keyword-fallback']).exactOptional(),
    isTurnNote: z.literal(true).exactOptional(),
  }),
);
