import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const modelCompactedCodec = defineRecordCodec(
  'model.compacted',
  z.object({
    trigger: z.enum(['manual', 'auto']),
    preTokens: z.int(),
    postTokens: z.int().nullable(),
    recalledThrough: z.int().nonnegative(),
  }),
);
