import { z } from 'zod';
import { defineRecordCodec } from './define-record-codec';
import { pauseCauseSchema } from './pause-cause-schema';

export const nixiePausedCodec = defineRecordCodec(
  'nixie.paused',
  z.object({
    cause: pauseCauseSchema,
    recoveryID: z.string().nullable(),
    by: z.string().nullable(),
  }),
);
