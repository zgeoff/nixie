import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const memoryVersionKeyedCodec = defineRecordCodec(
  'memory.version_keyed',
  z.object({
    itemID: z.string(),
    version: z.int().min(1),
    keyID: z.string(),
    evidenceQuote: z.string().nullable(),
    intentQuote: z.string().nullable(),
  }),
);
