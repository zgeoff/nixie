import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const recordForgetStartedCodec = defineRecordCodec(
  'record.forget_started',
  z.object({
    recordSequence: z.int(),

    // the starter's task.start calls that hold a forgotten brief, found while the brief is readable
    startCallSequences: z.int().array().exactOptional(),
  }),
);
