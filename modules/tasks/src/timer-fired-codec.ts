import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A durable timer that came due, when it was due, and when it fired.
export const timerFiredCodec = defineRecordCodec(
  'timer.fired',
  z.object({ timerID: z.string(), taskID: z.string(), dueAt: z.number(), firedAt: z.number() }),
);
