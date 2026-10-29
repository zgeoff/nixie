import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const timerIDsSchema = z.array(z.string());

export const taskClosedCodec = defineRecordCodec(
  'task.closed',
  z.object({
    taskID: z.string(),
    stepKey: z.string().nullable(),
    timerIDs: timerIDsSchema,
  }),
);
