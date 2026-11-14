import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const momentDestroyedCodec = defineRecordCodec(
  'moment_destroyed',
  z.object({
    momentID: z.string(),
    version: z.int().positive(),
    stage: z.enum(['started', 'done']),
  }),
);
