import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const timerFiredCodec = defineRecordCodec(
  'timer.fired',
  z.object({ timerID: z.string(), taskID: z.string(), dueAt: z.number(), firedAt: z.number() }),
);
