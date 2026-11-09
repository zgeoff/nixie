import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskFailedTurnSpentCodec = defineRecordCodec(
  'task.failed_turn_spent',
  z.object({
    taskID: z.string(),
    stepKey: z.string(),
    dollars: z.number(),
  }),
);
