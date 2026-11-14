import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskInterruptedCodec = defineRecordCodec(
  'task.interrupted',
  z.object({ taskID: z.string(), stepKey: z.string() }),
);
