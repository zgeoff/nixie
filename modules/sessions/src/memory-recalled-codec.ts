import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const recalledItemSchema = z.object({
  itemID: z.string(),
  version: z.int().positive(),
  score: z.number().exactOptional(),
  similarity: z.number().exactOptional(),
});

export const memoryRecalledCodec = defineRecordCodec(
  'memory.recalled',
  z.object({
    items: recalledItemSchema.array(),
    searchMode: z.enum(['hybrid', 'keyword', 'keyword-fallback']).exactOptional(),
    isTurnNote: z.literal(true).exactOptional(),
  }),
);
