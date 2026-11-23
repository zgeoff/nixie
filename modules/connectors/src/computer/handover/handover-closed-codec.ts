import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const handoverCloses = ['assistant', 'expired'] as const;

// `waitedSeconds` is how long the ask stood open, which an expired ask's message states
export const handoverClosedCodec = defineRecordCodec(
  'computer.handover_closed',
  z.object({
    shortID: z.string(),
    by: z.enum(handoverCloses),
    waitedSeconds: z.number(),
  }),
);
