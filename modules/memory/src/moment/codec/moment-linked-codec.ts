import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const momentLinkedCodec = defineRecordCodec(
  'moment_linked',
  z.object({
    momentID: z.string(),
    version: z.int().positive(),
    itemID: z.string(),
    isLinked: z.boolean(),
  }),
);
