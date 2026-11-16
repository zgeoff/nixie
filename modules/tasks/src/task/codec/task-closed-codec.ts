import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskClosedByValues = ['owner', 'nixie', 'disposable'] as const;
const timerIDsSchema = z.array(z.string());

export const taskClosedCodec = defineRecordCodec(
  'task.closed',
  z.object({
    taskID: z.string(),
    stepKey: z.string().nullable(),
    timerIDs: timerIDsSchema,
    closedBy: z.enum(taskClosedByValues).exactOptional(),
  }),
);
