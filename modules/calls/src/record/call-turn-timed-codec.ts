import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Timings and flags only, never audio or text.
export const callTurnTimedCodec = defineRecordCodec(
  'call.turn_timed',
  z.object({
    callID: z.string(),
    handOffID: z.string(),
    firstAudioMs: z.number().nonnegative(),
    handOffWaitMs: z.number().nonnegative(),
    cutOffByLayer: z.boolean(),
    interruptedByYou: z.boolean(),
  }),
);
