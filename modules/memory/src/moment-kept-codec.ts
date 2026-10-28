import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const momentKeptCodec = defineRecordCodec(
  'moment_kept',
  z.object({
    momentID: z.string(),
    shortID: z.string(),
    thread: z.string(),
    firstSequence: z.int().positive(),
    lastSequence: z.int().positive(),
    keptBy: z.enum(['owner', 'model']),
    keptThread: z.string().nullable(),
    model: z.string().nullable(),
  }),
);
