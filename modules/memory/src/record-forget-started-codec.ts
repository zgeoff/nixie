import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const recordForgetStartedCodec = defineRecordCodec(
  'record.forget_started',
  z.object({ recordSequence: z.int() }),
);
