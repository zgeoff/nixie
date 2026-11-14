import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const recordForgottenCodec = defineRecordCodec(
  'record.forgotten',
  z.object({ recordSequence: z.int() }),
);
