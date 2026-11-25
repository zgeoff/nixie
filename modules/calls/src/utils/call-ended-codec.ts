import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { callEndedBys } from './call-ended-by';

// `minutes` counts the minutes the call was open, each started minute as one.
export const callEndedCodec = defineRecordCodec(
  'call.ended',
  z.object({
    callID: z.string(),
    endedBy: z.enum(callEndedBys),
    minutes: z.int().nonnegative(),
  }),
);
