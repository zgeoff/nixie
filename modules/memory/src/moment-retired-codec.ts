import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const momentRetiredCodec = defineRecordCodec(
  'moment_retired',
  z.object({ momentID: z.string(), version: z.int().positive(), isRetired: z.boolean() }),
);
